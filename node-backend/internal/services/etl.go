package services

import (
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/hms-fyp/node-backend/internal/models"
	"github.com/sirupsen/logrus"
	"gorm.io/gorm"
)

type ETLService struct {
	db        *gorm.DB
	etlClient *ETLClient
	mu        sync.Mutex
	isRunning bool
	stopChan  chan bool
	ticker    *time.Ticker
}

func NewETLService(db *gorm.DB, etlClient *ETLClient) *ETLService {
	return &ETLService{
		db:        db,
		etlClient: etlClient,
		stopChan:  make(chan bool),
	}
}

// SaveConfig saves or updates the ETL configuration
func (s *ETLService) SaveConfig(config *models.ETLConfig) error {
	// Check if config already exists
	var existing models.ETLConfig
	result := s.db.First(&existing)

	if result.Error == gorm.ErrRecordNotFound {
		// Create new config
		if err := s.db.Create(config).Error; err != nil {
			return fmt.Errorf("failed to create ETL config: %w", err)
		}
		log.Printf("[ETL] Created new config with ID: %s", config.ID)
	} else {
		// Update existing config
		// Preserve passwords if empty string provided (user didn't change them)
		if config.DBPassword == "" {
			config.DBPassword = existing.DBPassword
		}
		if config.MinioSecretKey == "" {
			config.MinioSecretKey = existing.MinioSecretKey
		}

		config.ID = existing.ID
		config.CreatedAt = existing.CreatedAt

		log.Printf("[ETL] Updating config %s, DBPassword set: %v, MinioSecretKey set: %v",
			config.ID, config.DBPassword != "", config.MinioSecretKey != "")

		if err := s.db.Save(config).Error; err != nil {
			return fmt.Errorf("failed to update ETL config: %w", err)
		}
		log.Printf("[ETL] Updated config with ID: %s", config.ID)
	}

	return nil
}

// GetConfig retrieves the current ETL configuration
func (s *ETLService) GetConfig() (*models.ETLConfig, error) {
	var config models.ETLConfig
	if err := s.db.First(&config).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil // No config yet
		}
		return nil, fmt.Errorf("failed to get ETL config: %w", err)
	}
	return &config, nil
}

// TestConnection delegates database connectivity testing to the ETL server
func (s *ETLService) TestConnection(config *models.ETLConfig) error {
	req := &ETLTestConnectionRequest{
		DBHost:      config.DBHost,
		DBPort:      config.DBPort,
		DBName:      config.DBName,
		DBUser:      config.DBUser,
		DBPassword:  config.DBPassword,
		PythonPath:  config.PythonPath,
		ScriptsPath: config.ScriptsPath,
		JDBCPath:    config.JDBCPath,
	}

	success, message, err := s.etlClient.TestConnection(req)
	if err != nil {
		return fmt.Errorf("ETL server unreachable: %w", err)
	}
	if !success {
		return fmt.Errorf("connection test failed: %s", message)
	}
	return nil
}

// StartScheduler starts the ETL scheduler
func (s *ETLService) StartScheduler() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.isRunning {
		return fmt.Errorf("scheduler is already running")
	}

	// Get config
	config, err := s.GetConfig()
	if err != nil {
		return fmt.Errorf("failed to get ETL config: %w", err)
	}
	if config == nil {
		return fmt.Errorf("ETL not configured")
	}

	if !config.ScheduleEnabled {
		return fmt.Errorf("scheduling is not enabled")
	}

	// Currently only support frequency-based scheduling
	if config.ScheduleType != "frequency" {
		return fmt.Errorf("unsupported schedule type: %s", config.ScheduleType)
	}

	if config.FrequencySeconds <= 0 {
		return fmt.Errorf("invalid frequency: %d", config.FrequencySeconds)
	}

	// Mark as active
	config.IsActive = true
	if err := s.db.Save(config).Error; err != nil {
		return fmt.Errorf("failed to update config: %w", err)
	}

	// Start ticker
	s.ticker = time.NewTicker(time.Duration(config.FrequencySeconds) * time.Second)
	s.isRunning = true

	// Start goroutine
	go s.schedulerLoop(config.ID)

	log.Println("[ETL] Scheduler started with frequency:", config.FrequencySeconds, "seconds")
	return nil
}

// StopScheduler stops the ETL scheduler
func (s *ETLService) StopScheduler() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.isRunning {
		return fmt.Errorf("scheduler is not running")
	}

	// Stop ticker
	if s.ticker != nil {
		s.ticker.Stop()
	}

	// Signal stop
	s.stopChan <- true
	s.isRunning = false

	// Update config
	var config models.ETLConfig
	if err := s.db.First(&config).Error; err == nil {
		config.IsActive = false
		s.db.Save(&config)
	}

	log.Println("[ETL] Scheduler stopped")
	return nil
}

// schedulerLoop runs the ETL job on schedule
func (s *ETLService) schedulerLoop(configID uuid.UUID) {
	for {
		select {
		case <-s.ticker.C:
			log.Println("[ETL] Triggering scheduled job")
			if err := s.RunJob(configID); err != nil {
				log.Printf("[ETL] Job failed: %v", err)
			}
		case <-s.stopChan:
			log.Println("[ETL] Scheduler loop stopping")
			return
		}
	}
}

// RunJob executes a single ETL job by delegating to the remote ETL server.
// It creates a local job record, sends the request to the ETL server, then
// polls the remote job until it completes and syncs the result back.
func (s *ETLService) RunJob(configID uuid.UUID) error {
	// Get config
	var config models.ETLConfig
	if err := s.db.First(&config, "id = ?", configID).Error; err != nil {
		log.Printf("[ETL] Failed to get config: %v", err)
		return fmt.Errorf("failed to get config: %w", err)
	}

	// Get NessieNamespace from NodeConfig
	var nodeConfig models.NodeConfig
	if err := s.db.First(&nodeConfig).Error; err != nil {
		return fmt.Errorf("failed to get node config for Nessie namespace: %w", err)
	}

	// Determine date range
	var start, end time.Time
	if config.LastRunEnd != nil {
		start = config.LastRunEnd.Add(time.Second)
	} else {
		start = time.Now().Add(-24 * time.Hour)
	}
	end = time.Now()

	log.Printf("[ETL] Starting job for config %s, date range: %s to %s", configID, start.Format(time.RFC3339), end.Format(time.RFC3339))

	// Create local job record
	job := &models.ETLJob{
		ConfigID:       config.ID,
		StartTime:      time.Now(),
		DateRangeStart: start.Format(time.RFC3339),
		DateRangeEnd:   end.Format(time.RFC3339),
		Status:         "running",
		Stage:          "submitting",
		Logs:           "",
	}

	if err := s.db.Create(job).Error; err != nil {
		log.Printf("[ETL] Failed to create job record: %v", err)
		return fmt.Errorf("failed to create job: %w", err)
	}

	s.appendJobLog(job, fmt.Sprintf("Job started for date range %s to %s", start.Format("2006-01-02"), end.Format("2006-01-02")))

	// Build request for ETL server
	etlReq := &ETLJobRequest{
		DBHost:          config.DBHost,
		DBPort:          config.DBPort,
		DBName:          config.DBName,
		DBUser:          config.DBUser,
		DBPassword:      config.DBPassword,
		DBTable:         config.DBTable,
		MinioEndpoint:   config.MinioEndpoint,
		MinioAccessKey:  config.MinioAccessKey,
		MinioSecretKey:  config.MinioSecretKey,
		MinioBucket:     config.MinioBucket,
		NessieNamespace: nodeConfig.NessieNamespace,
		PythonPath:      config.PythonPath,
		ScriptsPath:     config.ScriptsPath,
		JDBCPath:        config.JDBCPath,
		OutputDir:       config.OutputDir,
		DateRangeStart:  start.Format(time.RFC3339),
		DateRangeEnd:    end.Format(time.RFC3339),
	}

	// Trigger job on ETL server
	remoteJobID, err := s.etlClient.TriggerJob(etlReq)
	if err != nil {
		logrus.WithError(err).Error("[ETL] Failed to trigger job on ETL server")
		s.updateJobError(job, "submitting", fmt.Errorf("ETL server error: %w", err))
		return fmt.Errorf("failed to trigger ETL job: %w", err)
	}

	s.appendJobLog(job, fmt.Sprintf("Job submitted to ETL server, remote job ID: %s", remoteJobID))
	job.Stage = "running"
	s.db.Save(job)

	// Poll the remote job until it finishes
	s.pollRemoteJob(job, remoteJobID, &config, end)

	return nil
}

// pollRemoteJob polls the ETL server until the job completes or fails
func (s *ETLService) pollRemoteJob(job *models.ETLJob, remoteJobID string, config *models.ETLConfig, end time.Time) {
	pollInterval := 3 * time.Second
	maxPollDuration := 2 * time.Hour
	deadline := time.Now().Add(maxPollDuration)

	for time.Now().Before(deadline) {
		time.Sleep(pollInterval)

		remoteJob, err := s.etlClient.GetJob(remoteJobID)
		if err != nil {
			logrus.WithError(err).Warn("[ETL] Failed to poll ETL server, will retry")
			continue
		}

		// Sync stage info
		job.Stage = remoteJob.Stage
		job.StagingPath = remoteJob.StagingPath
		job.NormalizedPath = remoteJob.NormalizedPath
		job.ValidatedPath = remoteJob.ValidatedPath
		job.RecordsExtracted = remoteJob.RecordsExtracted
		job.RecordsValidated = remoteJob.RecordsValidated
		job.RecordsFailed = remoteJob.RecordsFailed

		switch remoteJob.Status {
		case "completed":
			now := time.Now()
			job.Status = "completed"
			job.Stage = "completed"
			job.Message = "Job completed successfully"
			job.EndTime = &now
			job.Logs = remoteJob.Logs
			s.db.Save(job)

			// Update config last run
			config.LastRunAt = &now
			config.LastRunEnd = &end
			s.db.Save(config)

			logrus.WithField("job_id", job.ID).Info("[ETL] Remote job completed successfully")
			return

		case "failed":
			now := time.Now()
			job.Status = "failed"
			job.Message = remoteJob.Message
			job.EndTime = &now
			job.Logs = remoteJob.Logs
			s.db.Save(job)

			logrus.WithField("job_id", job.ID).Errorf("[ETL] Remote job failed: %s", remoteJob.Message)
			return

		default:
			// Still running — save intermediate state and continue polling
			s.db.Save(job)
		}
	}

	// Timed out
	s.updateJobError(job, job.Stage, fmt.Errorf("job polling timed out after %v", maxPollDuration))
}

// appendJobLog adds a timestamped log entry to the job
func (s *ETLService) appendJobLog(job *models.ETLJob, message string) {
	timestamp := time.Now().Format("2006-01-02 15:04:05")
	logEntry := fmt.Sprintf("[%s] %s\n", timestamp, message)
	job.Logs += logEntry
	s.db.Save(job)
}

// updateJobError updates job with error status
func (s *ETLService) updateJobError(job *models.ETLJob, stage string, err error) {
	log.Printf("[ETL] Job %s failed at stage %s: %v", job.ID, stage, err)
	s.appendJobLog(job, fmt.Sprintf("ERROR at stage %s: %v", stage, err))
	job.Status = "failed"
	job.Stage = stage
	job.Message = err.Error()
	endTime := time.Now()
	job.EndTime = &endTime
	if err := s.db.Save(job).Error; err != nil {
		log.Printf("[ETL] Failed to save job error: %v", err)
	}
}

// GetJobs retrieves ETL job history
func (s *ETLService) GetJobs(limit int, offset int) ([]models.ETLJob, int64, error) {
	var jobs []models.ETLJob
	var total int64

	// Get total count
	if err := s.db.Model(&models.ETLJob{}).Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("failed to count jobs: %w", err)
	}

	// Get jobs with pagination
	if err := s.db.Order("created_at desc").Limit(limit).Offset(offset).Find(&jobs).Error; err != nil {
		return nil, 0, fmt.Errorf("failed to get jobs: %w", err)
	}

	return jobs, total, nil
}

// GetJob retrieves a single job by ID
func (s *ETLService) GetJob(jobID uuid.UUID) (*models.ETLJob, error) {
	var job models.ETLJob
	if err := s.db.First(&job, "id = ?", jobID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get job: %w", err)
	}
	return &job, nil
}

// GetSchedulerStatus returns the current scheduler status
func (s *ETLService) GetSchedulerStatus() map[string]interface{} {
	s.mu.Lock()
	defer s.mu.Unlock()

	result := map[string]interface{}{
		"is_running": s.isRunning,
	}

	// Get config to show schedule details
	var config models.ETLConfig
	if err := s.db.First(&config).Error; err == nil {
		result["schedule_enabled"] = config.ScheduleEnabled
		result["schedule_type"] = config.ScheduleType
		result["frequency_seconds"] = config.FrequencySeconds
		result["is_active"] = config.IsActive

		if config.LastRunEnd != nil {
			result["last_run"] = config.LastRunEnd.Format(time.RFC3339)
			if s.isRunning && config.FrequencySeconds > 0 {
				nextRun := config.LastRunEnd.Add(time.Duration(config.FrequencySeconds) * time.Second)
				result["next_run"] = nextRun.Format(time.RFC3339)
				result["next_run_in_seconds"] = int(time.Until(nextRun).Seconds())
			}
		}
	}

	return result
}
