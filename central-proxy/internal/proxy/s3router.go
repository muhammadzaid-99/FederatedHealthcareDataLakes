package proxy

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	v4 "github.com/aws/aws-sdk-go-v2/aws/signer/v4"
	"github.com/aws/aws-sdk-go-v2/credentials"
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

	// Look up the hospital for this bucket
	var hospital *models.HospitalInfo
	var creds *models.STSCredentials
	var err error

	hospital, err = r.credService.GetHospitalByBucket(bucketName)
	if err != nil {
		// Try to resolve using namespace from the path
		// Pattern: /s3/hospital-data/iceberg/{namespace}/...
		namespace := r.extractNamespaceFromPath(trimmedPath)
		if namespace != "" {
			hospital, err = r.credService.GetHospitalByNamespace(namespace)
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
	creds, err = r.credService.GetCredentialsByNamespace(hospital.NessieNamespace)
	if err != nil {
		logrus.Errorf("Failed to get credentials for hospital %s: %v", hospital.Name, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get credentials"})
		return
	}

	// Build the target URL
	targetURL := fmt.Sprintf("%s/%s", strings.TrimSuffix(hospital.MinIOEndpoint, "/"), trimmedPath)

	logrus.Debugf("Routing S3 request to %s", targetURL)

	// Create a new request to forward
	var bodyReader io.Reader
	if c.Request.Body != nil {
		bodyReader = c.Request.Body
	}

	req, err := http.NewRequest(c.Request.Method, targetURL, bodyReader)
	if err != nil {
		logrus.Errorf("Failed to create request: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create request"})
		return
	}

	// Copy relevant headers (exclude AWS auth headers - we'll re-sign)
	for key, values := range c.Request.Header {
		lowerKey := strings.ToLower(key)
		// Skip AWS auth headers and host
		if lowerKey == "authorization" ||
			strings.HasPrefix(lowerKey, "x-amz-") ||
			lowerKey == "host" {
			continue
		}
		for _, value := range values {
			req.Header.Add(key, value)
		}
	}

	// Set content headers if present
	if c.Request.ContentLength > 0 {
		req.ContentLength = c.Request.ContentLength
	}

	// Sign the request with hospital credentials using AWS SigV4
	err = r.signRequest(req, creds)
	if err != nil {
		logrus.Errorf("Failed to sign request: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to sign request"})
		return
	}

	logrus.Debugf("Proxying signed S3 request to %s: %s %s",
		hospital.MinIOEndpoint, req.Method, req.URL.String())

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

	// Set status code
	c.Writer.WriteHeader(resp.StatusCode)

	// Copy response body
	if _, err := io.Copy(c.Writer, resp.Body); err != nil {
		logrus.Errorf("Failed to copy response body: %v", err)
	}
}

// signRequest signs an HTTP request using AWS SigV4
func (r *S3DataRouter) signRequest(req *http.Request, creds *models.STSCredentials) error {
	// Create credentials provider
	credProvider := credentials.NewStaticCredentialsProvider(
		creds.AccessKeyID,
		creds.SecretAccessKey,
		creds.SessionToken,
	)

	// Get credentials
	awsCreds, err := credProvider.Retrieve(context.Background())
	if err != nil {
		return fmt.Errorf("failed to retrieve credentials: %w", err)
	}

	// Create signer
	signer := v4.NewSigner()

	// For S3, we use unsigned payload for most requests
	payloadHash := "UNSIGNED-PAYLOAD"
	req.Header.Set("x-amz-content-sha256", payloadHash)

	// Sign the request
	err = signer.SignHTTP(context.Background(), awsCreds, req, payloadHash, "s3", "us-east-1", time.Now())
	if err != nil {
		return fmt.Errorf("failed to sign request: %w", err)
	}

	return nil
}

// extractNamespaceFromPath attempts to extract the Nessie namespace from an S3 path
// Expected patterns:
// - /hospital-data/iceberg/{namespace}/table/data/...
// - /iceberg/{namespace}/table/...
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
