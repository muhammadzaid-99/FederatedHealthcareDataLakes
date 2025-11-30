package proxy

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httputil"
	"net/url"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/hms-fyp/central-proxy/internal/services"
	"github.com/sirupsen/logrus"
)

// MetadataInterceptor handles Iceberg REST catalog requests to Nessie
// and injects STS credentials into LoadTable responses
type MetadataInterceptor struct {
	nessieURL   *url.URL
	credService *services.CredentialService
	proxy       *httputil.ReverseProxy
}

// LoadTableResponse represents the Iceberg REST catalog LoadTable response structure
type LoadTableResponse struct {
	MetadataLocation string                 `json:"metadata-location,omitempty"`
	Metadata         map[string]interface{} `json:"metadata,omitempty"`
	Config           map[string]string      `json:"config,omitempty"`
}

// Regex pattern to match LoadTable requests: GET /v1/namespaces/{ns}/tables/{table}
// Also matches with prefix and catalog paths
var loadTablePattern = regexp.MustCompile(`(?i)/v1(?:/[^/]+)?/namespaces/([^/]+)/tables/([^/]+)$`)

// NewMetadataInterceptor creates a new metadata interceptor proxy
func NewMetadataInterceptor(nessieEndpoint string, credService *services.CredentialService) (*MetadataInterceptor, error) {
	target, err := url.Parse(nessieEndpoint)
	if err != nil {
		return nil, fmt.Errorf("invalid nessie endpoint: %w", err)
	}

	interceptor := &MetadataInterceptor{
		nessieURL:   target,
		credService: credService,
	}

	// Create reverse proxy
	proxy := httputil.NewSingleHostReverseProxy(target)

	// Custom director to modify the request
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		// Ensure host header is set correctly
		req.Host = target.Host
		logrus.Debugf("Proxying request to Nessie: %s %s", req.Method, req.URL.String())
	}

	// Custom ModifyResponse to inject credentials
	proxy.ModifyResponse = interceptor.modifyResponse

	// Error handler
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		logrus.Errorf("Proxy error for %s: %v", r.URL.Path, err)
		http.Error(w, fmt.Sprintf("Proxy error: %v", err), http.StatusBadGateway)
	}

	interceptor.proxy = proxy
	return interceptor, nil
}

// Handle is the Gin handler for /iceberg/* routes
func (m *MetadataInterceptor) Handle(c *gin.Context) {
	// Strip /iceberg prefix from the path
	originalPath := c.Request.URL.Path
	if strings.HasPrefix(originalPath, "/iceberg") {
		c.Request.URL.Path = strings.TrimPrefix(originalPath, "/iceberg")
	}

	logrus.Debugf("Metadata Interceptor: %s %s -> %s", c.Request.Method, originalPath, c.Request.URL.Path)

	// Forward to Nessie via reverse proxy
	m.proxy.ServeHTTP(c.Writer, c.Request)
}

// modifyResponse intercepts the response from Nessie and injects credentials for LoadTable
func (m *MetadataInterceptor) modifyResponse(resp *http.Response) error {
	// Only process successful GET responses
	if resp.StatusCode != http.StatusOK || resp.Request.Method != http.MethodGet {
		return nil
	}

	// Check if this is a LoadTable request
	matches := loadTablePattern.FindStringSubmatch(resp.Request.URL.Path)
	if matches == nil {
		return nil
	}

	namespace := matches[1]
	tableName := matches[2]
	logrus.Infof("Intercepting LoadTable response for namespace=%s, table=%s", namespace, tableName)

	// Read the response body
	var body []byte
	var err error

	// Handle gzip encoding
	if resp.Header.Get("Content-Encoding") == "gzip" {
		reader, err := gzip.NewReader(resp.Body)
		if err != nil {
			logrus.Errorf("Failed to create gzip reader: %v", err)
			return nil
		}
		defer reader.Close()
		body, err = io.ReadAll(reader)
		if err != nil {
			logrus.Errorf("Failed to read gzipped response: %v", err)
			return nil
		}
		// Remove gzip encoding since we're returning uncompressed
		resp.Header.Del("Content-Encoding")
	} else {
		body, err = io.ReadAll(resp.Body)
		if err != nil {
			logrus.Errorf("Failed to read response body: %v", err)
			return nil
		}
	}
	resp.Body.Close()

	// Parse the JSON response
	var loadTableResp LoadTableResponse
	if err := json.Unmarshal(body, &loadTableResp); err != nil {
		logrus.Warnf("Failed to parse LoadTable response: %v", err)
		// Return original body
		resp.Body = io.NopCloser(bytes.NewBuffer(body))
		return nil
	}

	// Fetch credentials for this namespace
	creds, err := m.credService.GetCredentialsByNamespace(namespace)
	if err != nil {
		logrus.Warnf("Could not fetch credentials for namespace %s: %v", namespace, err)
		// Return original body without credentials
		resp.Body = io.NopCloser(bytes.NewBuffer(body))
		return nil
	}

	// Initialize config map if nil
	if loadTableResp.Config == nil {
		loadTableResp.Config = make(map[string]string)
	}

	// Inject STS credentials into the config
	loadTableResp.Config["s3.access-key-id"] = creds.AccessKeyID
	loadTableResp.Config["s3.secret-access-key"] = creds.SecretAccessKey
	if creds.SessionToken != "" {
		loadTableResp.Config["s3.session-token"] = creds.SessionToken
	}

	// Also inject MinIO endpoint if available
	if creds.MinIOEndpoint != "" {
		loadTableResp.Config["s3.endpoint"] = creds.MinIOEndpoint
	}

	logrus.Infof("Injected STS credentials for namespace %s (key: %s...)",
		namespace, truncateString(creds.AccessKeyID, 8))

	// Marshal the modified response
	modifiedBody, err := json.Marshal(loadTableResp)
	if err != nil {
		logrus.Errorf("Failed to marshal modified response: %v", err)
		resp.Body = io.NopCloser(bytes.NewBuffer(body))
		return nil
	}

	// Update response body and content length
	resp.Body = io.NopCloser(bytes.NewBuffer(modifiedBody))
	resp.ContentLength = int64(len(modifiedBody))
	resp.Header.Set("Content-Length", fmt.Sprintf("%d", len(modifiedBody)))

	logrus.Debugf("Modified LoadTable response: %d -> %d bytes", len(body), len(modifiedBody))
	return nil
}

// Helper to truncate strings for logging
func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen]
}
