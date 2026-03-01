package sts

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/sts"
	"github.com/google/uuid"
)

// STSConfig holds configuration for the STS client
type STSConfig struct {
	MinioEndpoint string
	AccessKey     string
	SecretKey     string
}

// TemporaryCredentials represents the STS temporary credentials
type TemporaryCredentials struct {
	AccessKeyID     string `json:"access_key_id"`
	SecretAccessKey string `json:"secret_access_key"`
	SessionToken    string `json:"session_token"`
	Expiration      string `json:"expiration"`
}

// NewSTSClient creates a new STS client configured to work with MinIO
func NewSTSClient(cfg STSConfig) (*sts.Client, error) {
	if cfg.MinioEndpoint == "" {
		return nil, fmt.Errorf("MinIO endpoint is required")
	}
	if cfg.AccessKey == "" || cfg.SecretKey == "" {
		return nil, fmt.Errorf("MinIO access key and secret key are required")
	}

	// Create custom endpoint resolver for MinIO
	customResolver := aws.EndpointResolverWithOptionsFunc(
		func(service, region string, options ...interface{}) (aws.Endpoint, error) {
			return aws.Endpoint{
				URL:               cfg.MinioEndpoint,
				SigningRegion:     "us-east-1", // MinIO uses us-east-1 by default
				HostnameImmutable: true,
			}, nil
		},
	)

	// Create AWS config with static credentials
	awsConfig := aws.Config{
		Region:                      "us-east-1",
		Credentials:                 credentials.NewStaticCredentialsProvider(cfg.AccessKey, cfg.SecretKey, ""),
		EndpointResolverWithOptions: customResolver,
	}

	// Create STS client
	stsClient := sts.NewFromConfig(awsConfig)

	return stsClient, nil
}

// GenerateRestrictedKeys generates temporary MinIO credentials with restricted access
// Parameters:
//   - stsClient: Configured STS client
//   - policy: IAM policy document as JSON string
//   - durationSeconds: Credential validity duration (default: 3600)
//
// Returns temporary credentials with access restricted by the provided policy
func GenerateRestrictedKeys(
	ctx context.Context,
	stsClient *sts.Client,
	policy string,
	durationSeconds int32,
) (*TemporaryCredentials, error) {
	if stsClient == nil {
		return nil, fmt.Errorf("STS client is required")
	}
	if policy == "" {
		return nil, fmt.Errorf("policy is required")
	}
	if durationSeconds <= 0 {
		durationSeconds = 43200 // Default 12 hours
	}

	// Generate a unique session name
	sessionName := fmt.Sprintf("TrinoQuery-%s", uuid.New().String())

	// MinIO requires a RoleArn parameter even though it validates primarily based on the caller's identity
	// This is a dummy ARN that follows AWS IAM format
	roleArn := "arn:aws:iam::123456789012:role/FederationBridge"

	log.Printf("[STS] Calling AssumeRole with session: %s, duration: %d seconds", sessionName, durationSeconds)
	log.Printf("[STS] Policy: %s", policy)

	// Call AssumeRole with inline policy
	input := &sts.AssumeRoleInput{
		RoleArn:         aws.String(roleArn),
		RoleSessionName: aws.String(sessionName),
		DurationSeconds: aws.Int32(durationSeconds),
		Policy:          aws.String(policy),
	}

	result, err := stsClient.AssumeRole(ctx, input)
	if err != nil {
		return nil, fmt.Errorf("AssumeRole failed: %w", err)
	}

	if result.Credentials == nil {
		return nil, fmt.Errorf("no credentials returned from AssumeRole")
	}

	// Extract credentials from response
	var expStr string
	if result.Credentials.Expiration != nil {
		// Must use RFC3339 format so downstream time.Parse(time.RFC3339, ...) succeeds.
		// time.Time.String() produces a non-RFC3339 format that silently fails to parse.
		expStr = result.Credentials.Expiration.Format(time.RFC3339)
	}

	creds := &TemporaryCredentials{
		AccessKeyID:     aws.ToString(result.Credentials.AccessKeyId),
		SecretAccessKey: aws.ToString(result.Credentials.SecretAccessKey),
		SessionToken:    aws.ToString(result.Credentials.SessionToken),
		Expiration:      expStr,
	}

	log.Printf("[STS] Successfully generated temporary credentials, expires at: %s", creds.Expiration)

	return creds, nil
}

// MaxSTSPolicySize is the maximum policy size (bytes) that MinIO STS accepts.
const MaxSTSPolicySize = 2048

// ErrPolicyTooLarge is returned when the generated policy exceeds MinIO's limit.
var ErrPolicyTooLarge = fmt.Errorf("policy_too_large")

// GenerateRestrictedKeysForIceberg is a convenience function that generates temporary credentials
// for Iceberg table access with department and date-based partitions
func GenerateRestrictedKeysForIceberg(
	ctx context.Context,
	stsClient *sts.Client,
	bucket string,
	namespace string,
	tablePattern string,
	departments []string,
	dates []string,
	durationSeconds int32,
) (*TemporaryCredentials, string, error) {
	// Build the policy
	policyDoc, err := BuildIcebergAccessPolicy(bucket, namespace, tablePattern, departments, dates)
	if err != nil {
		return nil, "", fmt.Errorf("failed to build policy: %w", err)
	}

	// Compact JSON for STS call (MinIO limits inline policy to 2048 bytes)
	policyCompact, err := policyDoc.ToJSON()
	if err != nil {
		return nil, "", fmt.Errorf("failed to convert policy to JSON: %w", err)
	}

	// Pretty JSON for storage/display
	policyPretty, err := policyDoc.ToJSONPretty()
	if err != nil {
		return nil, "", fmt.Errorf("failed to convert policy to pretty JSON: %w", err)
	}

	log.Printf("[STS] Policy size: %d bytes (compact), limit: %d bytes", len(policyCompact), MaxSTSPolicySize)

	if len(policyCompact) > MaxSTSPolicySize {
		log.Printf("[STS] Policy too large (%d bytes). %d departments x %d date patterns = %d resource ARNs",
			len(policyCompact), len(departments), len(dates), len(departments)*len(dates))
		return nil, "", fmt.Errorf("%w: generated policy is %d bytes (limit %d). "+
			"Try selecting complete months or fewer individual dates to reduce policy size",
			ErrPolicyTooLarge, len(policyCompact), MaxSTSPolicySize)
	}

	// Generate credentials using compact policy
	creds, err := GenerateRestrictedKeys(ctx, stsClient, policyCompact, durationSeconds)
	if err != nil {
		return nil, "", fmt.Errorf("failed to generate credentials: %w", err)
	}

	return creds, policyPretty, nil
}
