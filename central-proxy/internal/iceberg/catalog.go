package iceberg

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/gin-gonic/gin"
	"github.com/hms-fyp/central-proxy/internal/models"
	"github.com/hms-fyp/central-proxy/internal/services"
	"github.com/sirupsen/logrus"
)

// NamespaceSeparator is used to encode the access_key_id into the namespace
// so Trino (which cannot send custom headers) carries the credential identity.
// Format: "hospital_<uuid>::<access_key_id>"
const NamespaceSeparator = "::"

// IcebergCatalog implements the Iceberg REST Catalog API
// using Nessie's Core API (/api/v2) as the backend
type IcebergCatalog struct {
	nessieEndpoint string
	credService    *services.CredentialService
	httpClient     *http.Client
}

// NessieEntry represents an entry from Nessie /api/v2/trees/{ref}/entries
type NessieEntry struct {
	Type      string        `json:"type"`
	Name      NessieName    `json:"name"`
	ContentID string        `json:"contentId"`
	Content   NessieContent `json:"content,omitempty"`
}

type NessieName struct {
	Elements []string `json:"elements"`
}

type NessieContent struct {
	Type             string            `json:"type"`
	ID               string            `json:"id"`
	MetadataLocation string            `json:"metadataLocation,omitempty"`
	SnapshotID       int64             `json:"snapshotId,omitempty"`
	SchemaID         int               `json:"schemaId,omitempty"`
	SpecID           int               `json:"specId,omitempty"`
	SortOrderID      int               `json:"sortOrderId,omitempty"`
	Elements         []string          `json:"elements,omitempty"`
	Properties       map[string]string `json:"properties,omitempty"`
}

type NessieEntriesResponse struct {
	Token              *string         `json:"token"`
	Entries            []NessieEntry   `json:"entries"`
	EffectiveReference NessieReference `json:"effectiveReference"`
	HasMore            bool            `json:"hasMore"`
}

type NessieReference struct {
	Type string `json:"type"`
	Name string `json:"name"`
	Hash string `json:"hash"`
}

// Iceberg REST API response types
type IcebergConfigResponse struct {
	Defaults  map[string]string `json:"defaults"`
	Overrides map[string]string `json:"overrides"`
}

type IcebergNamespace struct {
	Namespace  []string          `json:"namespace"`
	Properties map[string]string `json:"properties,omitempty"`
}

type IcebergListNamespacesResponse struct {
	Namespaces [][]string `json:"namespaces"`
}

type IcebergTableIdentifier struct {
	Namespace []string `json:"namespace"`
	Name      string   `json:"name"`
}

type IcebergListTablesResponse struct {
	Identifiers []IcebergTableIdentifier `json:"identifiers"`
}

type IcebergLoadTableResponse struct {
	MetadataLocation string                 `json:"metadata-location"`
	Metadata         map[string]interface{} `json:"metadata"`
	Config           map[string]string      `json:"config,omitempty"`
}

type IcebergErrorResponse struct {
	Error IcebergError `json:"error"`
}

type IcebergError struct {
	Message string `json:"message"`
	Type    string `json:"type"`
	Code    int    `json:"code"`
}

// NewIcebergCatalog creates a new Iceberg REST Catalog handler
func NewIcebergCatalog(nessieEndpoint string, credService *services.CredentialService) *IcebergCatalog {
	return &IcebergCatalog{
		nessieEndpoint: strings.TrimSuffix(nessieEndpoint, "/"),
		credService:    credService,
		httpClient:     &http.Client{},
	}
}

// RegisterRoutes registers all Iceberg REST API routes
func (c *IcebergCatalog) RegisterRoutes(router *gin.RouterGroup) {
	router.GET("/v1/config", c.GetConfig)
	router.GET("/v1/namespaces", c.ListNamespaces)
	router.GET("/v1/:prefix/namespaces", c.ListNamespaces)
	router.GET("/v1/namespaces/:namespace", c.GetNamespace)
	router.GET("/v1/:prefix/namespaces/:namespace", c.GetNamespace)
	router.GET("/v1/namespaces/:namespace/tables", c.ListTables)
	router.GET("/v1/:prefix/namespaces/:namespace/tables", c.ListTables)
	router.GET("/v1/namespaces/:namespace/tables/:table", c.LoadTable)
	router.GET("/v1/:prefix/namespaces/:namespace/tables/:table", c.LoadTable)
}

// parseNamespaceAccessKey splits a namespace that may contain "::access_key_id"
// Returns (realNamespace, accessKeyID). If no separator found, accessKeyID is empty.
func parseNamespaceAccessKey(namespace string) (string, string) {
	idx := strings.Index(namespace, NamespaceSeparator)
	if idx == -1 {
		return namespace, ""
	}
	return namespace[:idx], namespace[idx+len(NamespaceSeparator):]
}

// GetConfig returns the Iceberg REST catalog configuration
func (c *IcebergCatalog) GetConfig(ctx *gin.Context) {
	config := IcebergConfigResponse{
		Defaults:  map[string]string{},
		Overrides: map[string]string{},
	}
	ctx.JSON(http.StatusOK, config)
}

// ListNamespaces returns all namespaces from Nessie
func (c *IcebergCatalog) ListNamespaces(ctx *gin.Context) {
	parent := ctx.Query("parent")
	pageToken := ctx.Query("pageToken")
	pageSize := ctx.Query("pageSize")
	logrus.Infof("ListNamespaces called: parent=%q, pageToken=%q, pageSize=%q, headers=%v",
		parent, pageToken, pageSize, ctx.Request.Header)

	// If parent contains ::, strip the access_key_id part for Nessie lookup
	realParent, _ := parseNamespaceAccessKey(parent)

	entries, err := c.fetchNessieEntries("main")
	if err != nil {
		logrus.Errorf("Failed to fetch Nessie entries: %v", err)
		ctx.JSON(http.StatusInternalServerError, IcebergErrorResponse{
			Error: IcebergError{
				Message: fmt.Sprintf("Failed to fetch namespaces: %v", err),
				Type:    "InternalServerError",
				Code:    500,
			},
		})
		return
	}

	var namespaces [][]string

	if realParent == "" {
		for _, entry := range entries {
			if entry.Type == "NAMESPACE" && len(entry.Name.Elements) == 1 {
				namespaces = append(namespaces, entry.Name.Elements)
			}
		}
	} else {
		logrus.Infof("ListNamespaces with parent=%q - returning empty", realParent)
		namespaces = [][]string{}
	}

	logrus.Infof("ListNamespaces returning %d namespaces", len(namespaces))
	ctx.JSON(http.StatusOK, IcebergListNamespacesResponse{
		Namespaces: namespaces,
	})
}

// GetNamespace returns details of a specific namespace
func (c *IcebergCatalog) GetNamespace(ctx *gin.Context) {
	rawNamespace := ctx.Param("namespace")
	namespace, _ := parseNamespaceAccessKey(rawNamespace)

	entries, err := c.fetchNessieEntries("main")
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, IcebergErrorResponse{
			Error: IcebergError{
				Message: fmt.Sprintf("Failed to fetch namespace: %v", err),
				Type:    "InternalServerError",
				Code:    500,
			},
		})
		return
	}

	for _, entry := range entries {
		if entry.Type == "NAMESPACE" && len(entry.Name.Elements) == 1 && entry.Name.Elements[0] == namespace {
			ctx.JSON(http.StatusOK, IcebergNamespace{
				Namespace:  entry.Name.Elements,
				Properties: entry.Content.Properties,
			})
			return
		}
	}

	ctx.JSON(http.StatusNotFound, IcebergErrorResponse{
		Error: IcebergError{
			Message: fmt.Sprintf("Namespace does not exist: %s", namespace),
			Type:    "NoSuchNamespaceException",
			Code:    404,
		},
	})
}

// ListTables returns all tables in a namespace
func (c *IcebergCatalog) ListTables(ctx *gin.Context) {
	rawNamespace := ctx.Param("namespace")
	namespace, _ := parseNamespaceAccessKey(rawNamespace)

	entries, err := c.fetchNessieEntries("main")
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, IcebergErrorResponse{
			Error: IcebergError{
				Message: fmt.Sprintf("Failed to fetch tables: %v", err),
				Type:    "InternalServerError",
				Code:    500,
			},
		})
		return
	}

	var identifiers []IcebergTableIdentifier
	for _, entry := range entries {
		if entry.Type == "ICEBERG_TABLE" && len(entry.Name.Elements) == 2 && entry.Name.Elements[0] == namespace {
			identifiers = append(identifiers, IcebergTableIdentifier{
				Namespace: []string{entry.Name.Elements[0]},
				Name:      entry.Name.Elements[1],
			})
		}
	}

	ctx.JSON(http.StatusOK, IcebergListTablesResponse{
		Identifiers: identifiers,
	})
}

// LoadTable returns table metadata with injected credentials.
// The namespace may contain "::access_key_id" to identify which specific
// STS credentials to use (preventing cross-requestor credential leakage).
func (c *IcebergCatalog) LoadTable(ctx *gin.Context) {
	rawNamespace := ctx.Param("namespace")
	table := ctx.Param("table")

	namespace, accessKeyID := parseNamespaceAccessKey(rawNamespace)

	logrus.Infof("LoadTable request: namespace=%s, table=%s, access_key_id=%s", namespace, table, accessKeyID)

	entries, err := c.fetchNessieEntries("main")
	if err != nil {
		logrus.Errorf("Failed to fetch Nessie entries: %v", err)
		ctx.JSON(http.StatusInternalServerError, IcebergErrorResponse{
			Error: IcebergError{
				Message: fmt.Sprintf("Failed to fetch table: %v", err),
				Type:    "InternalServerError",
				Code:    500,
			},
		})
		return
	}

	var tableEntry *NessieEntry
	for _, entry := range entries {
		if entry.Type == "ICEBERG_TABLE" &&
			len(entry.Name.Elements) == 2 &&
			entry.Name.Elements[0] == namespace &&
			entry.Name.Elements[1] == table {
			tableEntry = &entry
			break
		}
	}

	if tableEntry == nil {
		ctx.JSON(http.StatusNotFound, IcebergErrorResponse{
			Error: IcebergError{
				Message: fmt.Sprintf("Table does not exist: %s.%s", namespace, table),
				Type:    "NoSuchTableException",
				Code:    404,
			},
		})
		return
	}

	metadataLocation := tableEntry.Content.MetadataLocation
	if metadataLocation == "" {
		ctx.JSON(http.StatusInternalServerError, IcebergErrorResponse{
			Error: IcebergError{
				Message: "Table has no metadata location",
				Type:    "InternalServerError",
				Code:    500,
			},
		})
		return
	}

	logrus.Infof("Found table metadata location: %s", metadataLocation)

	// Step 2: Look up STS credentials
	var creds *models.STSCredentials
	if accessKeyID != "" {
		creds, err = c.credService.GetCredentialsByNamespaceAndAccessKey(namespace, accessKeyID)
		if err != nil {
			logrus.Warnf("Could not fetch credentials for namespace %s with access_key_id %s: %v", namespace, accessKeyID, err)
			ctx.JSON(http.StatusForbidden, IcebergErrorResponse{
				Error: IcebergError{
					Message: fmt.Sprintf("Access denied: invalid credentials for namespace %s", namespace),
					Type:    "ForbiddenException",
					Code:    403,
				},
			})
			return
		}
	} else {
		creds, err = c.credService.GetCredentialsByNamespace(namespace)
		if err != nil {
			logrus.Warnf("Could not fetch credentials for namespace %s: %v", namespace, err)
			ctx.JSON(http.StatusInternalServerError, IcebergErrorResponse{
				Error: IcebergError{
					Message: fmt.Sprintf("Failed to get credentials for namespace: %v", err),
					Type:    "InternalServerError",
					Code:    500,
				},
			})
			return
		}
	}

	metadata, err := c.fetchTableMetadata(metadataLocation, creds)
	if err != nil {
		logrus.Errorf("Failed to fetch table metadata from %s: %v", metadataLocation, err)
		ctx.JSON(http.StatusInternalServerError, IcebergErrorResponse{
			Error: IcebergError{
				Message: fmt.Sprintf("Failed to fetch table metadata: %v", err),
				Type:    "InternalServerError",
				Code:    500,
			},
		})
		return
	}

	proxyMetadataLocation := c.transformMetadataLocation(metadataLocation)

	config := map[string]string{
		"s3.access-key-id":     creds.AccessKeyID,
		"s3.secret-access-key": creds.SecretAccessKey,
		"s3.endpoint":          "http://central-proxy:8081/s3",
		"s3.path-style-access": "true",
		"s3.region":            "us-east-1",
	}

	if creds.SessionToken != "" {
		config["s3.session-token"] = creds.SessionToken
	}

	logrus.Infof("Returning LoadTable response with credentials for namespace %s (access_key_id: %s)", namespace, accessKeyID)

	ctx.JSON(http.StatusOK, IcebergLoadTableResponse{
		MetadataLocation: proxyMetadataLocation,
		Metadata:         metadata,
		Config:           config,
	})
}

func (c *IcebergCatalog) transformMetadataLocation(location string) string {
	if strings.HasPrefix(location, "s3a://") {
		return "s3://" + strings.TrimPrefix(location, "s3a://")
	}
	return location
}

func (c *IcebergCatalog) fetchTableMetadata(metadataLocation string, creds *models.STSCredentials) (map[string]interface{}, error) {
	bucket, key, err := parseS3URL(metadataLocation)
	if err != nil {
		return nil, fmt.Errorf("failed to parse metadata location: %w", err)
	}

	logrus.Infof("Fetching metadata: bucket=%s, key=%s, endpoint=%s, accessKeyID=%s, secretKeyLen=%d, sessionTokenLen=%d",
		bucket, key, creds.MinIOEndpoint,
		creds.AccessKeyID,
		len(creds.SecretAccessKey),
		len(creds.SessionToken))

	// Build S3 client pointing at this hospital's MinIO endpoint.
	// We use EndpointResolverWithOptions + HostnameImmutable=true so the
	// bucket name is never prepended to the host.
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

	// Generate a presigned URL instead of a signed GetObject request.
	// Presigned URLs embed the signature in query params and only sign the
	// 'host' header — Cloudflare Tunnel adding/modifying request headers
	// (cf-request-id, x-forwarded-for, accept-encoding, etc.) cannot
	// invalidate the signature the way a header-signed Authorization can.
	presignClient := s3.NewPresignClient(s3Client, func(o *s3.PresignOptions) {
		o.Expires = 15 * time.Minute
	})

	presignedReq, err := presignClient.PresignGetObject(context.Background(), &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to presign S3 request: %w", err)
	}

	logrus.Infof("Presigned URL generated (len=%d), fetching via plain GET", len(presignedReq.URL))

	// Plain HTTP GET — all auth is in the URL, no Authorization header to tamper with
	resp, err := c.httpClient.Get(presignedReq.URL)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch metadata from S3: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		errBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("S3 returned HTTP %d: %s", resp.StatusCode, string(errBody))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read metadata body: %w", err)
	}

	var metadata map[string]interface{}
	if err := json.Unmarshal(body, &metadata); err != nil {
		return nil, fmt.Errorf("failed to parse metadata JSON: %w", err)
	}

	logrus.Infof("Successfully fetched table metadata (%d bytes)", len(body))
	return metadata, nil
}

func parseS3URL(url string) (bucket, key string, err error) {
	path := url
	if strings.HasPrefix(url, "s3a://") {
		path = strings.TrimPrefix(url, "s3a://")
	} else if strings.HasPrefix(url, "s3://") {
		path = strings.TrimPrefix(url, "s3://")
	} else {
		return "", "", fmt.Errorf("invalid S3 URL: %s", url)
	}

	parts := strings.SplitN(path, "/", 2)
	if len(parts) != 2 {
		return "", "", fmt.Errorf("invalid S3 path: %s", path)
	}

	return parts[0], parts[1], nil
}

func (c *IcebergCatalog) fetchNessieEntries(ref string) ([]NessieEntry, error) {
	url := fmt.Sprintf("%s/api/v2/trees/%s/entries?content=true", c.nessieEndpoint, ref)

	resp, err := c.httpClient.Get(url)
	if err != nil {
		return nil, fmt.Errorf("failed to call Nessie API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("Nessie API returned %d: %s", resp.StatusCode, string(body))
	}

	var result NessieEntriesResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode Nessie response: %w", err)
	}

	return result.Entries, nil
}
