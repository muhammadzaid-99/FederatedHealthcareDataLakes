package services

import (
	"encoding/json"
	"fmt"

	"github.com/hms-fyp/central-control/internal/database"
	"github.com/hms-fyp/central-control/internal/models"
	"github.com/sirupsen/logrus"
)

type AuditService struct{}

func NewAuditService() *AuditService {
	return &AuditService{}
}

// Log creates an audit log entry
func (s *AuditService) Log(entityType, entityID, action, actorID string, details models.JSONB) {
	log := &models.AuditLog{
		EntityType: entityType,
		EntityID:   entityID,
		Action:     action,
		ActorID:    actorID,
		Details:    details,
	}

	if err := database.DB.Create(log).Error; err != nil {
		logrus.WithError(err).WithFields(logrus.Fields{
			"entity_type": entityType,
			"entity_id":   entityID,
			"action":      action,
		}).Error("Failed to create audit log")
	}
}

// LogWithActor creates an audit log entry with actor details
func (s *AuditService) LogWithActor(entityType, entityID, action, actorID, actorType, ipAddress string, details models.JSONB) error {
	log := &models.AuditLog{
		EntityType: entityType,
		EntityID:   entityID,
		Action:     action,
		ActorID:    actorID,
		ActorType:  actorType,
		IPAddress:  ipAddress,
		Details:    details,
	}

	if err := database.DB.Create(log).Error; err != nil {
		return fmt.Errorf("failed to create audit log: %w", err)
	}

	return nil
}

// GetAuditLogs retrieves audit logs with optional filters
func (s *AuditService) GetAuditLogs(entityType, entityID, action string, limit, offset int) ([]models.AuditLog, int64, error) {
	var logs []models.AuditLog
	var total int64

	query := database.DB.Model(&models.AuditLog{})

	if entityType != "" {
		query = query.Where("entity_type = ?", entityType)
	}

	if entityID != "" {
		query = query.Where("entity_id = ?", entityID)
	}

	if action != "" {
		query = query.Where("action = ?", action)
	}

	// Get total count
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("failed to count audit logs: %w", err)
	}

	// Get paginated results
	if err := query.Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&logs).Error; err != nil {
		return nil, 0, fmt.Errorf("failed to fetch audit logs: %w", err)
	}

	return logs, total, nil
}

// GetAuditLogsForEntity retrieves all audit logs for a specific entity
func (s *AuditService) GetAuditLogsForEntity(entityType, entityID string) ([]models.AuditLog, error) {
	var logs []models.AuditLog

	if err := database.DB.Where("entity_type = ? AND entity_id = ?", entityType, entityID).
		Order("created_at DESC").
		Find(&logs).Error; err != nil {
		return nil, fmt.Errorf("failed to fetch audit logs: %w", err)
	}

	return logs, nil
}

// ExportAuditLogs exports audit logs as JSON
func (s *AuditService) ExportAuditLogs(entityType, entityID, action string, limit int) ([]byte, error) {
	logs, _, err := s.GetAuditLogs(entityType, entityID, action, limit, 0)
	if err != nil {
		return nil, err
	}

	jsonData, err := json.MarshalIndent(logs, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("failed to marshal audit logs: %w", err)
	}

	return jsonData, nil
}
