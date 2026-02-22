package services

import (
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/hms-fyp/central-proxy/internal/config"
	"github.com/hms-fyp/central-proxy/internal/models"
	"github.com/patrickmn/go-cache"
	"github.com/sirupsen/logrus"
	"gorm.io/gorm"
)

// CredentialService manages fetching and caching of STS credentials
type CredentialService struct {
	db              *gorm.DB
	credentialCache *cache.Cache
	hospitalCache   *cache.Cache
	mu              sync.RWMutex
}

// NewCredentialService creates a new credential service
func NewCredentialService(db *gorm.DB, cfg *config.CacheConfig) *CredentialService {
	credTTL := time.Duration(cfg.CredentialTTLSeconds) * time.Second
	hospTTL := time.Duration(cfg.HospitalTTLSeconds) * time.Second

	return &CredentialService{
		db:              db,
		credentialCache: cache.New(credTTL, credTTL*2),
		hospitalCache:   cache.New(hospTTL, hospTTL*2),
	}
}

// GetCredentialsByNamespaceAndAccessKey fetches STS credentials for a namespace
// using a specific access_key_id to ensure only the rightful requestor's credentials are used.
func (s *CredentialService) GetCredentialsByNamespaceAndAccessKey(namespace string, accessKeyID string) (*models.STSCredentials, error) {
	// Check cache first
	cacheKey := fmt.Sprintf("creds:ns:%s:ak:%s", namespace, accessKeyID)
	if cached, found := s.credentialCache.Get(cacheKey); found {
		creds := cached.(*models.STSCredentials)
		if creds.IsValid() {
			logrus.Debugf("Cache hit for namespace credentials: %s (access_key_id: %s...)", namespace, accessKeyID[:min(8, len(accessKeyID))])
			return creds, nil
		}
		// Expired, remove from cache
		s.credentialCache.Delete(cacheKey)
	}

	// Look up hospital by namespace
	hospital, err := s.getHospitalByNamespace(namespace)
	if err != nil {
		return nil, fmt.Errorf("hospital not found for namespace %s: %w", namespace, err)
	}

	// Find the SPECIFIC approved response matching both hospital AND access_key_id
	var response models.NodeAccessResponse
	err = s.db.Where("hospital_id = ? AND status = ? AND access_key_id = upper(?)",
		hospital.ID, "APPROVED", accessKeyID).
		First(&response).Error

	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("no approved credentials found for hospital %s (namespace: %s) with access_key_id %s",
				hospital.Name, namespace, accessKeyID)
		}
		return nil, fmt.Errorf("database error: %w", err)
	}

	// Check if credentials are expired
	if response.CredExpiration != nil && time.Now().After(*response.CredExpiration) {
		return nil, fmt.Errorf("credentials expired for hospital %s (access_key_id: %s)", hospital.Name, accessKeyID)
	}

	// Build credentials object
	creds := &models.STSCredentials{
		AccessKeyID:     response.AccessKeyID,
		SecretAccessKey: response.SecretAccessKey,
		SessionToken:    response.SessionToken,
		Expiration:      response.CredExpiration,
		MinIOEndpoint:   getMinIOEndpoint(&response, hospital),
		NessieNamespace: namespace,
	}

	// Cache the credentials
	s.credentialCache.Set(cacheKey, creds, cache.DefaultExpiration)

	logrus.Infof("Fetched credentials for namespace %s (hospital: %s, access_key_id: %s...)",
		namespace, hospital.Name, accessKeyID[:min(8, len(accessKeyID))])
	return creds, nil
}

// GetCredentialsByNamespace fetches STS credentials for a given Nessie namespace
// DEPRECATED for data access paths - use GetCredentialsByNamespaceAndAccessKey instead.
// Still used for schema browsing where no specific access_key_id is needed.
func (s *CredentialService) GetCredentialsByNamespace(namespace string) (*models.STSCredentials, error) {
	// Check cache first
	cacheKey := fmt.Sprintf("creds:ns:%s", namespace)
	if cached, found := s.credentialCache.Get(cacheKey); found {
		creds := cached.(*models.STSCredentials)
		if creds.IsValid() {
			logrus.Debugf("Cache hit for namespace credentials: %s", namespace)
			return creds, nil
		}
		// Expired, remove from cache
		s.credentialCache.Delete(cacheKey)
	}

	// Look up hospital by namespace
	hospital, err := s.getHospitalByNamespace(namespace)
	if err != nil {
		return nil, fmt.Errorf("hospital not found for namespace %s: %w", namespace, err)
	}

	// Find the most recent approved response with valid credentials for this hospital
	var response models.NodeAccessResponse
	err = s.db.Where("hospital_id = ? AND status = ? AND access_key_id != ''",
		hospital.ID, "APPROVED").
		Order("responded_at DESC").
		First(&response).Error

	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("no approved credentials found for hospital %s (namespace: %s)",
				hospital.Name, namespace)
		}
		return nil, fmt.Errorf("database error: %w", err)
	}

	// Check if credentials are expired
	if response.CredExpiration != nil && time.Now().After(*response.CredExpiration) {
		return nil, fmt.Errorf("credentials expired for hospital %s", hospital.Name)
	}

	// Build credentials object
	creds := &models.STSCredentials{
		AccessKeyID:     response.AccessKeyID,
		SecretAccessKey: response.SecretAccessKey,
		SessionToken:    response.SessionToken,
		Expiration:      response.CredExpiration,
		MinIOEndpoint:   getMinIOEndpoint(&response, hospital),
		NessieNamespace: namespace,
	}

	// Cache the credentials
	s.credentialCache.Set(cacheKey, creds, cache.DefaultExpiration)

	logrus.Infof("Fetched credentials for namespace %s (hospital: %s)", namespace, hospital.Name)
	return creds, nil
}

// GetCredentialsByHospitalID fetches STS credentials for a given hospital ID
func (s *CredentialService) GetCredentialsByHospitalID(hospitalID uuid.UUID) (*models.STSCredentials, error) {
	cacheKey := fmt.Sprintf("creds:id:%s", hospitalID.String())
	if cached, found := s.credentialCache.Get(cacheKey); found {
		creds := cached.(*models.STSCredentials)
		if creds.IsValid() {
			return creds, nil
		}
		s.credentialCache.Delete(cacheKey)
	}

	// Get hospital info
	hospital, err := s.getHospitalByID(hospitalID)
	if err != nil {
		return nil, err
	}

	// Find credentials
	var response models.NodeAccessResponse
	err = s.db.Where("hospital_id = ? AND status = ? AND access_key_id != ''",
		hospitalID, "APPROVED").
		Order("responded_at DESC").
		First(&response).Error

	if err != nil {
		return nil, fmt.Errorf("no approved credentials found for hospital ID %s: %w", hospitalID, err)
	}

	if response.CredExpiration != nil && time.Now().After(*response.CredExpiration) {
		return nil, fmt.Errorf("credentials expired for hospital ID %s", hospitalID)
	}

	creds := &models.STSCredentials{
		AccessKeyID:     response.AccessKeyID,
		SecretAccessKey: response.SecretAccessKey,
		SessionToken:    response.SessionToken,
		Expiration:      response.CredExpiration,
		MinIOEndpoint:   getMinIOEndpoint(&response, hospital),
		NessieNamespace: getStringValue(hospital.NessieNamespace),
	}

	s.credentialCache.Set(cacheKey, creds, cache.DefaultExpiration)
	return creds, nil
}

// GetHospitalByNamespace returns hospital info for a namespace
func (s *CredentialService) GetHospitalByNamespace(namespace string) (*models.HospitalInfo, error) {
	hospital, err := s.getHospitalByNamespace(namespace)
	if err != nil {
		return nil, err
	}

	return &models.HospitalInfo{
		ID:              hospital.ID,
		Name:            hospital.Name,
		NessieNamespace: getStringValue(hospital.NessieNamespace),
		MinIOEndpoint:   getStringValue(hospital.MinIOEndpoint),
	}, nil
}

// GetHospitalByBucket returns hospital info based on bucket name
func (s *CredentialService) GetHospitalByBucket(bucket string) (*models.HospitalInfo, error) {
	cacheKey := fmt.Sprintf("hospital:bucket:%s", bucket)
	if cached, found := s.hospitalCache.Get(cacheKey); found {
		return cached.(*models.HospitalInfo), nil
	}

	// Strategy 1: Bucket name might be the namespace itself
	hospital, err := s.getHospitalByNamespace(bucket)
	if err == nil {
		info := &models.HospitalInfo{
			ID:              hospital.ID,
			Name:            hospital.Name,
			NessieNamespace: getStringValue(hospital.NessieNamespace),
			MinIOEndpoint:   getStringValue(hospital.MinIOEndpoint),
		}
		s.hospitalCache.Set(cacheKey, info, cache.DefaultExpiration)
		return info, nil
	}

	return nil, fmt.Errorf("could not resolve hospital for bucket: %s", bucket)
}

// GetAllHospitals returns all active hospitals with their endpoints
func (s *CredentialService) GetAllHospitals() ([]models.HospitalInfo, error) {
	var hospitals []models.Hospital
	err := s.db.Where("status = ?", "ACTIVE").Find(&hospitals).Error
	if err != nil {
		return nil, fmt.Errorf("failed to fetch hospitals: %w", err)
	}

	result := make([]models.HospitalInfo, 0, len(hospitals))
	for _, h := range hospitals {
		result = append(result, models.HospitalInfo{
			ID:              h.ID,
			Name:            h.Name,
			NessieNamespace: getStringValue(h.NessieNamespace),
			MinIOEndpoint:   getStringValue(h.MinIOEndpoint),
		})
	}
	return result, nil
}

// Internal helpers

func (s *CredentialService) getHospitalByNamespace(namespace string) (*models.Hospital, error) {
	cacheKey := fmt.Sprintf("hospital:ns:%s", namespace)
	if cached, found := s.hospitalCache.Get(cacheKey); found {
		return cached.(*models.Hospital), nil
	}

	var hospital models.Hospital
	err := s.db.Where("nessie_namespace = ?", namespace).First(&hospital).Error
	if err != nil {
		return nil, err
	}

	s.hospitalCache.Set(cacheKey, &hospital, cache.DefaultExpiration)
	return &hospital, nil
}

func (s *CredentialService) getHospitalByID(id uuid.UUID) (*models.Hospital, error) {
	cacheKey := fmt.Sprintf("hospital:id:%s", id.String())
	if cached, found := s.hospitalCache.Get(cacheKey); found {
		return cached.(*models.Hospital), nil
	}

	var hospital models.Hospital
	err := s.db.Where("id = ?", id).First(&hospital).Error
	if err != nil {
		return nil, err
	}

	s.hospitalCache.Set(cacheKey, &hospital, cache.DefaultExpiration)
	return &hospital, nil
}

func getMinIOEndpoint(response *models.NodeAccessResponse, hospital *models.Hospital) string {
	if response.MinIOEndpoint != "" {
		return response.MinIOEndpoint
	}
	return getStringValue(hospital.MinIOEndpoint)
}

func getStringValue(ptr *string) string {
	if ptr == nil {
		return ""
	}
	return *ptr
}

// InvalidateCache clears all caches - useful for testing or manual refresh
func (s *CredentialService) InvalidateCache() {
	s.credentialCache.Flush()
	s.hospitalCache.Flush()
	logrus.Info("Credential and hospital caches invalidated")
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
