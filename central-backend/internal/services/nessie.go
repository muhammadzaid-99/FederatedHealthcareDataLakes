package services

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/hms-fyp/central-control/internal/config"
	"github.com/sirupsen/logrus"
)

type NessieService struct {
	cfg        *config.Config
	httpClient *http.Client
}

func NewNessieService(cfg *config.Config) *NessieService {
	return &NessieService{
		cfg: cfg,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// CreateNamespace allocates a namespace identifier in Nessie for a hospital
func (s *NessieService) CreateNamespace(namespace string) error {
	// Note: In Nessie/Iceberg, namespaces are created implicitly when tables are created within them
	// The hospital node will create actual Iceberg tables in this namespace on first write
	// We just allocate the namespace identifier here and return success

	logrus.WithFields(logrus.Fields{
		"namespace": namespace,
	}).Info("Nessie namespace allocated (will be created on first table write)")

	return nil
}

// ValidateNamespaceAccess validates that a hospital has access to a specific namespace
// Future implementation: This would check namespace-scoped tokens
func (s *NessieService) ValidateNamespaceAccess(hospitalID, namespace, token string) error {
	expectedNamespace := fmt.Sprintf("hospital_%s", hospitalID)
	if namespace != expectedNamespace {
		return fmt.Errorf("unauthorized access to namespace %s", namespace)
	}
	// TODO: Implement token validation when Nessie auth is fully integrated
	return nil
}

// GetNamespaceInfo retrieves information about a namespace
func (s *NessieService) GetNamespaceInfo(namespace string) (map[string]interface{}, error) {
	url := fmt.Sprintf("%s/api/v2/trees/branch/%s/entries/%s",
		s.cfg.Nessie.Endpoint,
		s.cfg.Nessie.DefaultBranch,
		namespace,
	)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send request to Nessie: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("nessie API returned status %d: %s", resp.StatusCode, string(body))
	}

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	return result, nil
}

// HealthCheck checks if Nessie service is available
func (s *NessieService) HealthCheck() error {
	url := fmt.Sprintf("%s/api/v2/config", s.cfg.Nessie.Endpoint)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("nessie is not reachable: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("nessie health check failed with status %d", resp.StatusCode)
	}

	return nil
}
