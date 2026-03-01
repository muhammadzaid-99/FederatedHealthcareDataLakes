package proxy

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/gin-gonic/gin"
	"github.com/hms-fyp/central-proxy/internal/models"
	"github.com/hms-fyp/central-proxy/internal/services"
	"github.com/sirupsen/logrus"
)

// S3DataRouter handles S3 data requests and routes them to the appropriate hospital MinIO
type S3DataRouter struct {
	credService *services.CredentialService
	httpClient  *http.Client
	mu          sync.RWMutex
}

// NewS3DataRouter creates a new S3 data router
func NewS3DataRouter(credService *services.CredentialService) *S3DataRouter {
	return &S3DataRouter{
		credService: credService,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// Handle is the Gin handler for /s3/* routes
// It re-signs requests with hospital credentials before forwarding to MinIO
func (r *S3DataRouter) Handle(c *gin.Context) {
	// Parse the path to extract bucket name
	// Format: /s3/{bucket-name}/path/to/object
	path := c.Request.URL.Path
	if !strings.HasPrefix(path, "/s3/") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid S3 path"})
		return
	}

	// Remove /s3/ prefix
	trimmedPath := strings.TrimPrefix(path, "/s3/")
	parts := strings.SplitN(trimmedPath, "/", 2)
	if len(parts) < 1 || parts[0] == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Bucket name required"})
		return
	}

	bucketName := parts[0]
	objectPath := ""
	if len(parts) > 1 {
		objectPath = parts[1]
	}

	logrus.Debugf("S3 Router: bucket=%s, object=%s", bucketName, objectPath)

	// Extract namespace (which may contain ::access_key_id) from the path
	rawNamespace := r.extractNamespaceFromPath(trimmedPath)
	realNamespace, accessKeyID := parseNamespaceAccessKey(rawNamespace)

	// Look up the hospital for this bucket
	var hospital *models.HospitalInfo
	var creds *models.STSCredentials
	var err error

	hospital, err = r.credService.GetHospitalByBucket(bucketName)
	if err != nil {
		// Try to resolve using namespace from the path
		// Pattern: /s3/hospital-data/iceberg/{namespace}/...
		if realNamespace != "" {
			hospital, err = r.credService.GetHospitalByNamespace(realNamespace)
		}
	}

	if err != nil {
		logrus.Warnf("Could not resolve hospital for bucket %s: %v", bucketName, err)
		c.JSON(http.StatusNotFound, gin.H{
			"error":  "Hospital not found for bucket",
			"bucket": bucketName,
		})
		return
	}

	if hospital.MinIOEndpoint == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error":    "Hospital MinIO endpoint not configured",
			"hospital": hospital.Name,
		})
		return
	}

	// Get credentials for this hospital
	// If access_key_id was encoded in the namespace, use the specific credential lookup
	if accessKeyID != "" {
		creds, err = r.credService.GetCredentialsByNamespaceAndAccessKey(hospital.NessieNamespace, accessKeyID)
	} else {
		creds, err = r.credService.GetCredentialsByNamespace(hospital.NessieNamespace)
	}
	if err != nil {
		logrus.Errorf("Failed to get credentials for hospital %s: %v", hospital.Name, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get credentials"})
		return
	}

	// Build the target object path (strip bucket prefix — path-style MinIO)
	// trimmedPath = "hospital-data/iceberg/..." so the key starts after the bucket
	objectKey := objectPath

	logrus.Debugf("S3 Router: bucket=%s, key=%s, endpoint=%s", bucketName, objectKey, hospital.MinIOEndpoint)

	// Build presigned URL: all auth in query params, so Cloudflare Tunnel
	// adding/modifying headers cannot break the SigV4 signature.
	presignedURL, err := r.presignRequest(c.Request.Method, bucketName, objectKey, creds)
	if err != nil {
		logrus.Errorf("Failed to presign S3 request: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to presign request"})
		return
	}

	logrus.Debugf("Presigned S3 URL (len=%d), proxying %s", len(presignedURL), c.Request.Method)

	// Forward as plain HTTP request with no AWS auth headers
	var bodyReader io.Reader
	if c.Request.Body != nil {
		bodyReader = c.Request.Body
	}

	req, err := http.NewRequest(c.Request.Method, presignedURL, bodyReader)
	if err != nil {
		logrus.Errorf("Failed to create request: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create request"})
		return
	}

	// Copy safe, non-auth headers (content-type, range, etc.)
	for key, values := range c.Request.Header {
		lowerKey := strings.ToLower(key)
		if lowerKey == "authorization" ||
			strings.HasPrefix(lowerKey, "x-amz-") ||
			lowerKey == "host" {
			continue
		}
		for _, value := range values {
			req.Header.Add(key, value)
		}
	}
	if c.Request.ContentLength > 0 {
		req.ContentLength = c.Request.ContentLength
	}

	// Forward the request
	resp, err := r.httpClient.Do(req)
	if err != nil {
		logrus.Errorf("S3 proxy error for %s: %v", hospital.MinIOEndpoint, err)
		c.JSON(http.StatusBadGateway, gin.H{"error": fmt.Sprintf("S3 proxy error: %v", err)})
		return
	}
	defer resp.Body.Close()

	// Copy response headers
	for key, values := range resp.Header {
		for _, value := range values {
			c.Writer.Header().Add(key, value)
		}
	}

	c.Writer.WriteHeader(resp.StatusCode)

	if _, err := io.Copy(c.Writer, resp.Body); err != nil {
		logrus.Errorf("Failed to copy response body: %v", err)
	}
}

// presignRequest generates a presigned URL for the given S3 method/bucket/key.
// Only GET and HEAD are supported (Trino only reads data).
func (r *S3DataRouter) presignRequest(method, bucket, key string, creds *models.STSCredentials) (string, error) {
	minioResolver := aws.EndpointResolverWithOptionsFunc(
		func(service, region string, options ...interface{}) (aws.Endpoint, error) {
			return aws.Endpoint{
				URL:               creds.MinIOEndpoint,
				HostnameImmutable: true,
				SigningRegion:     "us-east-1",
			}, nil
		},
	)
	awsCfg := aws.Config{
		Region: "us-east-1",
		Credentials: credentials.NewStaticCredentialsProvider(
			creds.AccessKeyID,
			creds.SecretAccessKey,
			creds.SessionToken,
		),
		EndpointResolverWithOptions: minioResolver,
	}
	s3Client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.UsePathStyle = true
	})
	presignClient := s3.NewPresignClient(s3Client, func(o *s3.PresignOptions) {
		o.Expires = 15 * time.Minute
	})

	input := &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	}

	switch strings.ToUpper(method) {
	case http.MethodGet:
		req, err := presignClient.PresignGetObject(context.Background(), input)
		if err != nil {
			return "", err
		}
		return req.URL, nil
	case http.MethodHead:
		req, err := presignClient.PresignHeadObject(context.Background(), &s3.HeadObjectInput{
			Bucket: aws.String(bucket),
			Key:    aws.String(key),
		})
		if err != nil {
			return "", err
		}
		return req.URL, nil
	default:
		return "", fmt.Errorf("unsupported S3 method for presigning: %s", method)
	}
}

// extractNamespaceFromPath attempts to extract the Nessie namespace from an S3 path
// Expected patterns:
// - /hospital-data/iceberg/{namespace}/table/data/...
// - /iceberg/{namespace}/table/...
// The namespace may contain "::access_key_id" which we preserve for credential lookup.
func (r *S3DataRouter) extractNamespaceFromPath(path string) string {
	parts := strings.Split(path, "/")

	// Look for "iceberg" segment and get the next part as namespace
	for i, part := range parts {
		if part == "iceberg" && i+1 < len(parts) {
			return parts[i+1]
		}
	}

	return ""
}

// parseNamespaceAccessKey splits a namespace that may contain "::access_key_id"
// Returns (realNamespace, accessKeyID). If no separator found, accessKeyID is empty.
func parseNamespaceAccessKey(namespace string) (string, string) {
	idx := strings.Index(namespace, "::")
	if idx == -1 {
		return namespace, ""
	}
	return namespace[:idx], namespace[idx+2:]
}
