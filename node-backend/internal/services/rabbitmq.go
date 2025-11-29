package services

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/hms-fyp/node-backend/internal/config"
	"github.com/hms-fyp/node-backend/internal/database"
	"github.com/hms-fyp/node-backend/internal/models"
	"github.com/sirupsen/logrus"
	"github.com/streadway/amqp"
)

type RabbitMQService struct {
	cfg         *config.Config
	conn        *amqp.Connection
	channel     *amqp.Channel
	queueName   string
	stopSignal  chan bool
	isListening bool
	mu          sync.Mutex // Protects isListening flag
}

func NewRabbitMQService(cfg *config.Config) *RabbitMQService {
	return &RabbitMQService{
		cfg:        cfg,
		stopSignal: make(chan bool),
	}
}

// Connect establishes connection to RabbitMQ
func (s *RabbitMQService) Connect(rabbitURL string) error {
	var err error
	s.conn, err = amqp.Dial(rabbitURL)
	if err != nil {
		return fmt.Errorf("failed to connect to RabbitMQ: %w", err)
	}

	s.channel, err = s.conn.Channel()
	if err != nil {
		return fmt.Errorf("failed to open channel: %w", err)
	}

	logrus.Info("Connected to RabbitMQ")
	return nil
}

// StartListening starts consuming messages from the queue
func (s *RabbitMQService) StartListening(queueName string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Check if already listening
	if s.isListening {
		logrus.Warnf("RabbitMQ listener already running for queue: %s", s.queueName)
		return nil
	}

	s.queueName = queueName

	// Use passive declaration to check if queue exists without modifying it
	// This avoids parameter mismatch errors with existing queues
	_, err := s.channel.QueueDeclarePassive(
		queueName, // name
		true,      // durable
		false,     // delete when unused
		false,     // exclusive
		false,     // no-wait
		nil,       // arguments - passive mode ignores these
	)
	if err != nil {
		logrus.Warnf("Queue %s not found, will try to consume anyway: %v", queueName, err)
		// Don't return error - the queue might still be consumable
		// If it's really missing, the Consume call will fail
	}

	// Start consuming
	msgs, err := s.channel.Consume(
		queueName, // queue
		"",        // consumer
		false,     // auto-ack (manual ack for reliability)
		false,     // exclusive
		false,     // no-local
		false,     // no-wait
		nil,       // args
	)
	if err != nil {
		return fmt.Errorf("failed to register consumer: %w", err)
	}

	s.isListening = true
	logrus.Infof("Started listening on queue: %s", queueName)

	// Process messages in goroutine
	go func() {
		logrus.Info("RabbitMQ consumer goroutine started, waiting for messages...")
		for {
			select {
			case msg, ok := <-msgs:
				if !ok {
					logrus.Error("RabbitMQ channel closed")
					s.mu.Lock()
					s.isListening = false
					s.mu.Unlock()
					return
				}
				logrus.Infof("Received message from queue %s, size: %d bytes", queueName, len(msg.Body))
				s.handleMessage(msg)
			case <-s.stopSignal:
				logrus.Info("Stopping RabbitMQ listener")
				s.mu.Lock()
				s.isListening = false
				s.mu.Unlock()
				return
			}
		}
	}()

	return nil
}

// handleMessage processes a received message
func (s *RabbitMQService) handleMessage(delivery amqp.Delivery) {
	logrus.Infof("Processing message: %s", string(delivery.Body))

	// Parse message
	var msgPayload map[string]interface{}
	if err := json.Unmarshal(delivery.Body, &msgPayload); err != nil {
		logrus.Errorf("Failed to parse message: %v", err)
		delivery.Nack(false, false) // Don't requeue invalid messages
		return
	}

	// Determine message type
	msgType := "unknown"
	if t, ok := msgPayload["type"].(string); ok {
		msgType = t
	}

	// Store message in database
	message := models.Message{
		QueueName:   s.queueName,
		MessageType: msgType,
		Payload:     string(delivery.Body),
		Status:      "pending",
	}

	if err := database.DB.Create(&message).Error; err != nil {
		logrus.Errorf("Failed to store message: %v", err)
		delivery.Nack(false, true) // Requeue on DB error
		return
	}

	// Process message based on type
	if err := s.processMessage(&message, msgPayload); err != nil {
		logrus.Errorf("Failed to process message: %v", err)
		message.Status = "failed"
	} else {
		message.Status = "processed"
		now := time.Now()
		message.ProcessedAt = &now
	}

	// Update message status
	database.DB.Save(&message)

	// Acknowledge message
	delivery.Ack(false)
}

// processMessage handles specific message types
func (s *RabbitMQService) processMessage(message *models.Message, payload map[string]interface{}) error {
	switch message.MessageType {
	case "data_request":
		logrus.Info("Processing data request message")
		return s.handleDataRequest(message, payload)
	case "notification":
		logrus.Info("Processing notification message")
		// TODO: Handle notification
		return nil
	default:
		logrus.Warnf("Unknown message type: %s", message.MessageType)
		return nil
	}
}

// handleDataRequest creates a DataRequest from the incoming message
func (s *RabbitMQService) handleDataRequest(message *models.Message, payload map[string]interface{}) error {
	// Extract fields from payload
	requestorID := ""
	if v, ok := payload["requestor_id"].(string); ok {
		requestorID = v
	}
	if v, ok := payload["requestor_email"].(string); ok && requestorID == "" {
		requestorID = v
	}

	requestType := "data_access"
	if v, ok := payload["request_type"].(string); ok {
		requestType = v
	}

	// Create DataRequest record
	dataRequest := models.DataRequest{
		MessageID:      message.ID,
		RequestorID:    requestorID,
		RequestType:    requestType,
		Status:         "pending",
		RequestPayload: message.Payload,
	}

	if err := database.DB.Create(&dataRequest).Error; err != nil {
		logrus.WithError(err).Error("Failed to create DataRequest from message")
		return fmt.Errorf("failed to create data request: %w", err)
	}

	logrus.WithFields(logrus.Fields{
		"data_request_id": dataRequest.ID,
		"message_id":      message.ID,
		"requestor_id":    requestorID,
	}).Info("DataRequest created from incoming message")

	return nil
}

// Stop stops the RabbitMQ listener
func (s *RabbitMQService) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.isListening {
		s.stopSignal <- true
		s.isListening = false
	}

	if s.channel != nil {
		s.channel.Close()
	}
	if s.conn != nil {
		s.conn.Close()
	}
	logrus.Info("RabbitMQ connection closed")
}

// IsListening returns whether the service is currently listening
func (s *RabbitMQService) IsListening() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.isListening
}
