package services

import (
	"context"
	"fmt"
	"time"

	"github.com/hms-fyp/central-control/internal/config"
	amqp "github.com/rabbitmq/amqp091-go"
	"github.com/sirupsen/logrus"
)

const (
	ExchangeName    = "central.requests"
	DeadLetterQueue = "central.dlq"
	ExchangeType    = "topic"
)

type RabbitMQService struct {
	cfg       *config.Config
	conn      *amqp.Connection
	channel   *amqp.Channel
	connected bool
}

func NewRabbitMQService(cfg *config.Config) *RabbitMQService {
	return &RabbitMQService{
		cfg:       cfg,
		connected: false,
	}
}

// Connect establishes connection to RabbitMQ
func (s *RabbitMQService) Connect() error {
	var err error

	// Retry connection logic
	maxRetries := 5
	for i := 0; i < maxRetries; i++ {
		s.conn, err = amqp.Dial(s.cfg.RabbitMQ.GetAMQPURL())
		if err == nil {
			break
		}
		logrus.Warnf("Failed to connect to RabbitMQ (attempt %d/%d): %v", i+1, maxRetries, err)
		time.Sleep(time.Second * 5)
	}

	if err != nil {
		return fmt.Errorf("failed to connect to RabbitMQ after %d attempts: %w", maxRetries, err)
	}

	s.channel, err = s.conn.Channel()
	if err != nil {
		return fmt.Errorf("failed to open channel: %w", err)
	}

	// Set QoS
	if err := s.channel.Qos(10, 0, false); err != nil {
		return fmt.Errorf("failed to set QoS: %w", err)
	}

	s.connected = true

	// Setup exchange
	if err := s.setupExchange(); err != nil {
		return fmt.Errorf("failed to setup exchange: %w", err)
	}

	// Setup dead letter queue
	if err := s.setupDeadLetterQueue(); err != nil {
		return fmt.Errorf("failed to setup dead letter queue: %w", err)
	}

	logrus.Info("Successfully connected to RabbitMQ")
	return nil
}

// setupExchange creates the topic exchange for routing requests
func (s *RabbitMQService) setupExchange() error {
	return s.channel.ExchangeDeclare(
		ExchangeName,
		ExchangeType,
		true,  // durable
		false, // auto-delete
		false, // internal
		false, // no-wait
		nil,   // arguments
	)
}

// setupDeadLetterQueue creates the dead letter queue
func (s *RabbitMQService) setupDeadLetterQueue() error {
	_, err := s.channel.QueueDeclare(
		DeadLetterQueue,
		true,  // durable
		false, // auto-delete
		false, // exclusive
		false, // no-wait
		nil,   // arguments
	)
	return err
}

// ProvisionHospitalQueue provisions a dedicated queue for a hospital
func (s *RabbitMQService) ProvisionHospitalQueue(queueName string) error {
	if s == nil {
		return fmt.Errorf("RabbitMQ service is not initialized")
	}
	if !s.connected || s.channel == nil {
		// Try to reconnect
		if err := s.ensureConnection(); err != nil {
			return fmt.Errorf("not connected to RabbitMQ: %w", err)
		}
	}

	// Declare queue with dead letter exchange
	_, err := s.channel.QueueDeclare(
		queueName,
		true,  // durable
		false, // auto-delete
		false, // exclusive
		false, // no-wait
		amqp.Table{
			"x-dead-letter-exchange":    "",
			"x-dead-letter-routing-key": DeadLetterQueue,
			"x-message-ttl":             7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
		},
	)
	if err != nil {
		return fmt.Errorf("failed to declare queue: %w", err)
	}

	// Bind queue to exchange
	// Extract hospital ID from queue name (format: hospital.{id}.requests)
	routingKey := fmt.Sprintf("request.%s", queueName[9:len(queueName)-9]) // Extract ID from queue name

	err = s.channel.QueueBind(
		queueName,
		routingKey,
		ExchangeName,
		false,
		nil,
	)
	if err != nil {
		return fmt.Errorf("failed to bind queue: %w", err)
	}

	logrus.WithFields(logrus.Fields{
		"queue":       queueName,
		"routing_key": routingKey,
	}).Info("Hospital queue provisioned successfully")

	return nil
}

// PublishAccessRequest publishes an access request to hospital queues
func (s *RabbitMQService) PublishAccessRequest(hospitalID string, requestID string, payload []byte) error {
	if s == nil {
		return fmt.Errorf("RabbitMQ service is not initialized")
	}
	if !s.connected || s.channel == nil {
		// Try to reconnect
		if err := s.ensureConnection(); err != nil {
			return fmt.Errorf("not connected to RabbitMQ: %w", err)
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	routingKey := fmt.Sprintf("request.%s", hospitalID)

	err := s.channel.PublishWithContext(
		ctx,
		ExchangeName,
		routingKey,
		false, // mandatory
		false, // immediate
		amqp.Publishing{
			ContentType:  "application/json",
			DeliveryMode: amqp.Persistent,
			MessageId:    requestID,
			Timestamp:    time.Now(),
			Body:         payload,
		},
	)

	if err != nil {
		return fmt.Errorf("failed to publish message: %w", err)
	}

	logrus.WithFields(logrus.Fields{
		"hospital_id": hospitalID,
		"request_id":  requestID,
	}).Info("Access request published to queue")

	return nil
}

// Close closes the RabbitMQ connection
func (s *RabbitMQService) Close() error {
	if s == nil {
		return nil
	}
	if s.channel != nil {
		if err := s.channel.Close(); err != nil {
			logrus.WithError(err).Warn("Failed to close RabbitMQ channel")
		}
	}

	if s.conn != nil {
		if err := s.conn.Close(); err != nil {
			logrus.WithError(err).Warn("Failed to close RabbitMQ connection")
			return err
		}
	}

	s.connected = false
	logrus.Info("RabbitMQ connection closed")
	return nil
}

// ensureConnection checks and reconnects if necessary
func (s *RabbitMQService) ensureConnection() error {
	// Check if connection and channel are valid
	if s.conn != nil && !s.conn.IsClosed() && s.channel != nil {
		return nil
	}

	logrus.Warn("RabbitMQ connection lost, attempting to reconnect...")
	s.connected = false

	// Close existing connections if any
	if s.channel != nil {
		s.channel.Close()
		s.channel = nil
	}
	if s.conn != nil {
		s.conn.Close()
		s.conn = nil
	}

	// Reconnect
	return s.Connect()
}

// HealthCheck checks if RabbitMQ connection is alive
func (s *RabbitMQService) HealthCheck() error {
	if s == nil {
		return fmt.Errorf("RabbitMQ service is not initialized")
	}
	if !s.connected || s.conn == nil || s.conn.IsClosed() {
		return fmt.Errorf("not connected to RabbitMQ")
	}
	return nil
}
