package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"os/signal"
	"sync"
	"syscall"
	"time"
)

type Config struct {
	FrequencySeconds int    `json:"frequency_seconds"`
	SparkScriptPath  string `json:"spark_script_path"`
	MetadataPath     string `json:"metadata_path"`
}

type Metadata struct {
	LastRun string `json:"last_run"` // ISO8601 format
}

func loadConfig() Config {
	data, err := os.ReadFile("config.json")
	if err != nil {
		log.Fatalf("[FATAL] Failed to read config.json: %v", err)
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		log.Fatalf("[FATAL] Invalid config format: %v", err)
	}
	log.Println("[INFO] Configuration loaded")
	return cfg
}

func loadMetadata(path string) Metadata {
	var md Metadata
	data, err := os.ReadFile(path)
	if err != nil {
		log.Printf("[WARN] Metadata file not found, starting fresh: %s", path)
		return md
	}
	if err := json.Unmarshal(data, &md); err != nil {
		log.Printf("[ERROR] Failed to parse metadata: %v", err)
	}
	return md
}

// func saveMetadata(path string, md Metadata) {
// 	data, err := json.MarshalIndent(md, "", "  ")
// 	if err != nil {
// 		log.Printf("[ERROR] Failed to serialize metadata: %v", err)
// 		return
// 	}
// 	if err := os.WriteFile(path, data, 0644); err != nil {
// 		log.Printf("[ERROR] Failed to save metadata: %v", err)
// 	}
// 	log.Println("[INFO] Metadata updated")
// }

func runSparkJob(cfg Config, start string, end string) (string, bool) {
	log.Printf("[INFO] Starting PySpark job from %s to %s", start, end)

	cmd := exec.Command("/home/muhammad-zaid/myenv/bin/python", cfg.SparkScriptPath+"/extract2.py", start, end)
	var stdout bytes.Buffer
	cmd.Stdout = &stdout
	// cmd.Stderr = &stderr
	// cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	var res map[string]any
	if err := cmd.Run(); err != nil {
		log.Printf("[ERROR] Job failed: %v", err)
	} else {
		log.Println("[INFO] Extraction Job completed successfully")
	}

	if err := json.Unmarshal(stdout.Bytes(), &res); err != nil {
		log.Printf("[ERROR] Failed to parse Python stdout json: %v; stdout: %s", err, stdout.String())
		return "", false
	}

	stagingPath := res["staging_path"].(string)
	fmt.Println("Staging Path:", stagingPath)

	// return "", nil
	return stagingPath, true
}

func normalizeStagedData(cfg Config, stagingPath string, normalizedPath string) bool {
	log.Printf("[INFO] Starting Normalize job")

	cmd := exec.Command("/home/muhammad-zaid/myenv/bin/python", cfg.SparkScriptPath+"/fhir_transform.py", stagingPath, normalizedPath)
	var stdout bytes.Buffer
	cmd.Stdout = &stdout
	// cmd.Stderr = &stderr
	// cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	var res map[string]any
	if err := cmd.Run(); err != nil {
		log.Printf("[ERROR] Job failed: %v", err)
	} else {
		log.Println("[INFO] Extraction Job completed successfully")

		if err := json.Unmarshal(stdout.Bytes(), &res); err != nil {
			log.Printf("[ERROR] Failed to parse Python stdout json: %v; stdout: %s", err, stdout.String())
			return false
		}
	}

	// fmt.Println("Normalized Path:", normalizedPath)
	success, ok := res["success"].(bool)
	if !ok {
		log.Printf("[ERROR] 'success' field missing or not a bool in Python stdout json")
		return false
	}
	log.Println("[INFO] ", res["message"])
	return success
}

func validateAndPublish(cfg Config, start string, end string, normalizedPath string, validatedPath string) bool {
	log.Printf("[INFO] Starting Enrich, Validate, Publish job")

	pythonBin := "/home/muhammad-zaid/myenv/bin/python"
	validateScript := cfg.SparkScriptPath + "/validate_publish.py"
	cmd := exec.Command(pythonBin, validateScript, start, end, normalizedPath, validatedPath)

	// inherit environment and append PYSPARK settings so executors use same venv python
	env := os.Environ()
	// env = append(env, "PYSPARK_PYTHON="+pythonBin)
	// env = append(env, "PYSPARK_DRIVER_PYTHON="+pythonBin)
	env = append(env,
		"PYSPARK_PYTHON="+pythonBin,
		"PYSPARK_DRIVER_PYTHON="+pythonBin,
		// "SPARK_SQL_EXTENSIONS=org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions",
		// "SPARK_SQL_CATALOG_local=org.apache.iceberg.spark.SparkCatalog",
		// "SPARK_SQL_CATALOG_local_TYPE=hive",
		// "SPARK_SQL_CATALOG_local_WAREHOUSE="+validatedPath, // same directory you already write to
	)

	// optionally force local master via an env var your script reads or pass args;
	// better: ensure the script creates SparkSession with master='local[4]'.
	cmd.Env = env

	var stdout bytes.Buffer
	cmd.Stdout = &stdout
	// cmd.Stderr = &stderr
	// cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	var res map[string]any
	if err := cmd.Run(); err != nil {
		log.Printf("[ERROR] Job failed: %v", err)
	} else {
		log.Println("[INFO] Validation Job completed successfully")

		if err := json.Unmarshal(stdout.Bytes(), &res); err != nil {
			log.Printf("[ERROR] Failed to parse Python stdout json: %v; stdout: %s", err, stdout.String())
			return false
		}
	}

	success, ok := res["success"].(bool)
	if !ok {
		log.Printf("[ERROR] 'success' field missing or not a bool in Python stdout json")
		return false
	}
	log.Println("[INFO] ", res["message"])
	return success
}

func cleanUp(stagedPath string, normalizedPath string, validatedPath string) {
	paths := []string{stagedPath, normalizedPath, validatedPath}
	for _, p := range paths {
		if err := os.RemoveAll(p); err != nil {
			log.Printf("[WARN] Failed to delete path %s: %v", p, err)
		} else {
			log.Printf("[INFO] Deleted path: %s", p)
		}
	}
}

func main() {
	log.SetFlags(log.LstdFlags | log.Lmsgprefix)
	log.SetPrefix("[ETL] ")

	cfg := loadConfig()
	md := loadMetadata(cfg.MetadataPath)

	var lastRun time.Time
	if md.LastRun != "" {
		t, err := time.Parse(time.RFC3339, md.LastRun)
		if err != nil {
			log.Fatalf("[FATAL] Invalid last_run timestamp: %v", err)
		}
		lastRun = t
	}

	ticker := time.NewTicker(time.Duration(cfg.FrequencySeconds) * time.Second)
	defer ticker.Stop()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)

	var wg sync.WaitGroup
	wg.Add(1)

	go func() {
		defer wg.Done()

		for {
			select {
			case <-ticker.C:
				start := lastRun.Add(time.Second).Format(time.RFC3339)
				end := time.Now().Format(time.RFC3339)
				log.Printf("[INFO] Triggering job for range: %s → %s", start, end)

				// if stagedPath, done := runSparkJob(cfg, start, end); done {
				// 	log.Println("Data Staged for Normalization")
				// 	normalizedPath := filepath.Join(filepath.Dir(filepath.Dir(stagedPath)), "normalized", filepath.Base(stagedPath))
				// 	if normalizeStagedData(cfg, stagedPath, normalizedPath) {
				// 		log.Println("Normalized Data Stored, Now Validating")
				// 		validatedPath := filepath.Join(filepath.Dir(filepath.Dir(stagedPath)), "validated", filepath.Base(normalizedPath))

				// 		if validateAndPublish(cfg, start, end, normalizedPath, validatedPath) {
				// 			log.Println("Validated Data Stored")
				// 			log.Println("Cleaning Up Local Data")
				// 			cleanUp(stagedPath, normalizedPath, validatedPath)
				// 			log.Println("Cleanup job done.")
				// 		}

				// 	}
				// }

				validateAndPublish(cfg, start, end, "parquet/normalized/checkups_2025-09-11_15-58-44", "parquet/validated/checkups_2025-09-11_15-58-44")

				// HERE A CHECK NEEDS TO BE ADDED TO SEE IF JOB WAS SUCCESSFUL OR NOT TO MAKE SURE
				// THAT NO DATA IS SKIPPED AND WE DO NOT ACCIDENTALLY UPDATE METADATA

				md.LastRun = end
				// saveMetadata(cfg.MetadataPath, md)

				t, _ := time.Parse(time.RFC3339, end)
				lastRun = t

				return

				// wg.Done() // temporarily added to quit after one iteration
			case <-stop:
				log.Println("[INFO] Shutting down ETL scheduler gracefully")
				return
			}
		}
	}()

	log.Println("[INFO] ETL scheduler started")
	log.Printf("[INFO] Frequency is set to %v", time.Duration(cfg.FrequencySeconds)*time.Second)
	wg.Wait()
	log.Println("[INFO] Exiting")
}
