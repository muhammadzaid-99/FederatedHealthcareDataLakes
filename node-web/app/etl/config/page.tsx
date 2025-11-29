"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, AlertCircle, Loader2, Play, Square } from "lucide-react";
import { formatDateTimeString, formatTimeString } from '@/lib/utils';
import { api } from "@/lib/api";

interface ETLConfig {
  id?: string;
  db_host: string;
  db_port: number;
  db_name: string;
  db_user: string;
  db_password: string;
  db_table: string;
  minio_endpoint: string;
  minio_access_key: string;
  minio_secret_key: string;
  minio_bucket: string;
  python_path: string;
  scripts_path: string;
  jdbc_path: string;
  schedule_enabled: boolean;
  schedule_type: string;
  frequency_seconds: number;
  cron_expression: string;
  output_dir: string;
  departments: string[];
  enrichment_version: string;
  is_active?: boolean;
}

interface SchedulerStatus {
  is_running: boolean;
  schedule_enabled?: boolean;
  schedule_type?: string;
  frequency_seconds?: number;
  is_active?: boolean;
  last_run?: string;
  next_run?: string;
  next_run_in_seconds?: number;
}

export default function ETLConfigPage() {
  const [config, setConfig] = useState<ETLConfig>({
    db_host: "localhost",
    db_port: 5432,
    db_name: "hms",
    db_user: "postgres",
    db_password: "",
    db_table: "checkups",
    minio_endpoint: "http://localhost:9000",
    minio_access_key: "etluser",
    minio_secret_key: "",
    minio_bucket: "hospital-data",
    python_path: "/home/muhammad-zaid/myenv/bin/python",
    scripts_path: "/home/muhammad-zaid/Documents/hms_fyp/hms-dls2/node-backend/scripts",
    jdbc_path: "/home/muhammad-zaid/Documents/hms_fyp/hms-dls2/node-backend/scripts/postgresql-42.7.7.jar",
    schedule_enabled: false,
    schedule_type: "frequency",
    frequency_seconds: 300,
    cron_expression: "",
    output_dir: "/home/muhammad-zaid/Documents/hms_fyp/hms-dls2/node-backend/parquet",
    departments: ["cardiology", "neurology"],
    enrichment_version: "v1",
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);
  const [hasDbPassword, setHasDbPassword] = useState(false);
  const [hasMinioSecret, setHasMinioSecret] = useState(false);

  useEffect(() => {
    loadConfig();
    loadSchedulerStatus();
    
    // Refresh scheduler status every 5 seconds
    const interval = setInterval(loadSchedulerStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const response = await api.get("/etl/config");
      console.log("Load config response:", response);
      if (response.config) {
        // Set config but clear passwords for display (they're never sent from backend)
        const loadedConfig = {
          ...response.config,
          db_password: "", // Never display password
          minio_secret_key: "", // Never display secret
        };
        setConfig(loadedConfig);
        // Track if passwords are set
        setHasDbPassword(response.has_db_password || false);
        setHasMinioSecret(response.has_minio_secret || false);
      }
    } catch (error: any) {
      if (error.message?.includes('404') || error.message?.includes('not configured')) {
        console.log("No ETL config found, using defaults");
      } else {
        console.error("Failed to load ETL config:", error);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadSchedulerStatus = async () => {
    try {
      const response = await api.get("/etl/scheduler/status");
      console.log("Scheduler status response:", response);
      setSchedulerStatus(response);
    } catch (error) {
      console.error("Failed to load scheduler status:", error);
    }
  };

  const handleInputChange = (field: keyof ETLConfig, value: any) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    setTestResult(null);
    try {
      console.log("Saving", config)
      const response = await api.post("/etl/config", config);
      console.log("Save response:", response);
      alert("ETL configuration saved successfully!");
      await loadConfig();
      await loadSchedulerStatus();
    } catch (error: any) {
      console.error("Save error:", error);
      alert(`Failed to save configuration: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const response = await api.post("/etl/test-connection", config);
      console.log("Test connection response:", response);
      // Response is directly the success/message object
      setTestResult({
        success: response.success || false,
        message: response.message || "Unknown response"
      });
    } catch (error: any) {
      console.error("Test connection error:", error);
      setTestResult({
        success: false,
        message: error.message || "Connection test failed",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleStartScheduler = async () => {
    try {
      await api.post("/etl/scheduler/start");
      alert("ETL scheduler started successfully!");
      loadSchedulerStatus();
    } catch (error: any) {
      alert(`Failed to start scheduler: ${error.response?.data?.error || error.message}`);
    }
  };

  const handleStopScheduler = async () => {
    try {
      await api.post("/etl/scheduler/stop");
      alert("ETL scheduler stopped successfully!");
      loadSchedulerStatus();
    } catch (error: any) {
      alert(`Failed to stop scheduler: ${error.response?.data?.error || error.message}`);
    }
  };

  const handleRunManualJob = async () => {
    try {
      await api.post("/etl/jobs/run");
      alert("ETL job started! Check the Jobs page for progress.");
    } catch (error: any) {
      alert(`Failed to start job: ${error.response?.data?.error || error.message}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">ETL Configuration</h1>
          <p className="text-muted-foreground">Configure data extraction, transformation, and loading settings</p>
        </div>
        <div className="flex gap-2">
          {schedulerStatus && (
            <>
              <Badge variant={schedulerStatus.is_running ? "default" : "secondary"}>
                {schedulerStatus.is_running ? "Scheduler Running" : "Scheduler Stopped"}
              </Badge>
              {schedulerStatus.is_running && schedulerStatus.next_run && (
                <Badge variant="outline">
                  Next run: {formatTimeString(schedulerStatus.next_run)}
                </Badge>
              )}
            </>
          )}
        </div>
      </div>

      {/* Scheduler Status Card */}
      {schedulerStatus && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle>Scheduler Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Status:</span>
              <Badge variant={schedulerStatus.is_running ? "default" : "secondary"}>
                {schedulerStatus.is_running ? "Running" : "Stopped"}
              </Badge>
            </div>
            {schedulerStatus.schedule_enabled && (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Schedule Type:</span>
                  <span className="text-sm">{schedulerStatus.schedule_type || "N/A"}</span>
                </div>
                {schedulerStatus.frequency_seconds && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Frequency:</span>
                    <span className="text-sm">Every {Math.floor(schedulerStatus.frequency_seconds / 60)} minutes</span>
                  </div>
                )}
                {schedulerStatus.last_run && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Last Run:</span>
                    <span className="text-sm">{formatDateTimeString(schedulerStatus.last_run)}</span>
                  </div>
                )}
                {schedulerStatus.is_running && schedulerStatus.next_run && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Next Run:</span>
                    <span className="text-sm">{formatDateTimeString(schedulerStatus.next_run)}</span>
                  </div>
                )}
              {schedulerStatus.is_running && schedulerStatus.next_run_in_seconds !== undefined && schedulerStatus.next_run_in_seconds > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Next Run In:</span>
                  <span className="text-sm">{Math.floor(schedulerStatus.next_run_in_seconds / 60)}m {schedulerStatus.next_run_in_seconds % 60}s</span>
                </div>
              )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Database Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Database Configuration</CardTitle>
          <CardDescription>Configure the source database for data extraction</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="db_host">Database Host</Label>
              <Input
                id="db_host"
                value={config.db_host}
                onChange={(e) => handleInputChange("db_host", e.target.value)}
                placeholder="localhost"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="db_port">Database Port</Label>
              <Input
                id="db_port"
                type="number"
                value={config.db_port}
                onChange={(e) => handleInputChange("db_port", parseInt(e.target.value))}
                placeholder="5432"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="db_name">Database Name</Label>
              <Input
                id="db_name"
                value={config.db_name}
                onChange={(e) => handleInputChange("db_name", e.target.value)}
                placeholder="hms"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="db_table">Table Name</Label>
              <Input
                id="db_table"
                value={config.db_table}
                onChange={(e) => handleInputChange("db_table", e.target.value)}
                placeholder="checkups"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="db_user">Database User</Label>
              <Input
                id="db_user"
                value={config.db_user}
                onChange={(e) => handleInputChange("db_user", e.target.value)}
                placeholder="postgres"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="db_password">Database Password</Label>
              <Input
                id="db_password"
                type="password"
                value={config.db_password}
                onChange={(e) => handleInputChange("db_password", e.target.value)}
                placeholder={hasDbPassword ? "Enter new password to change" : "Enter password"}
              />
              {hasDbPassword && config.db_password === "" && (
                <p className="text-xs text-green-600">✓ Password is set (hidden for security)</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleTestConnection} disabled={testing} variant="outline">
              {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Test Connection
            </Button>
            {testResult && (
              <div className="flex items-center gap-2">
                {testResult.success ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span className="text-sm text-green-600">{testResult.message}</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 text-red-500" />
                    <span className="text-sm text-red-600">{testResult.message}</span>
                  </>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* MinIO Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>MinIO Configuration</CardTitle>
          <CardDescription>Configure object storage for processed data</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="minio_endpoint">MinIO Endpoint</Label>
              <Input
                id="minio_endpoint"
                value={config.minio_endpoint}
                onChange={(e) => handleInputChange("minio_endpoint", e.target.value)}
                placeholder="http://localhost:9000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="minio_bucket">Bucket Name</Label>
              <Input
                id="minio_bucket"
                value={config.minio_bucket}
                onChange={(e) => handleInputChange("minio_bucket", e.target.value)}
                placeholder="hospital-data"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="minio_access_key">Access Key</Label>
              <Input
                id="minio_access_key"
                value={config.minio_access_key}
                onChange={(e) => handleInputChange("minio_access_key", e.target.value)}
                placeholder="etluser"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="minio_secret_key">Secret Key</Label>
              <Input
                id="minio_secret_key"
                type="password"
                value={config.minio_secret_key}
                onChange={(e) => handleInputChange("minio_secret_key", e.target.value)}
                placeholder={hasMinioSecret ? "Enter new secret to change" : "Enter secret key"}
              />
              {hasMinioSecret && config.minio_secret_key === "" && (
                <p className="text-xs text-green-600">✓ Secret key is set (hidden for security)</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Python & Scripts Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Python & Scripts Configuration</CardTitle>
          <CardDescription>Configure Python environment and script paths</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="python_path">Python Executable Path</Label>
            <Input
              id="python_path"
              value={config.python_path}
              onChange={(e) => handleInputChange("python_path", e.target.value)}
              placeholder="/path/to/python"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="scripts_path">Scripts Directory Path</Label>
            <Input
              id="scripts_path"
              value={config.scripts_path}
              onChange={(e) => handleInputChange("scripts_path", e.target.value)}
              placeholder="/path/to/scripts"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="jdbc_path">JDBC Driver Path</Label>
            <Input
              id="jdbc_path"
              value={config.jdbc_path}
              onChange={(e) => handleInputChange("jdbc_path", e.target.value)}
              placeholder="/path/to/postgresql.jar"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="output_dir">Output Directory</Label>
            <Input
              id="output_dir"
              value={config.output_dir}
              onChange={(e) => handleInputChange("output_dir", e.target.value)}
              placeholder="/path/to/output"
            />
          </div>
        </CardContent>
      </Card>

      {/* Scheduling Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Scheduling Configuration</CardTitle>
          <CardDescription>Configure automatic ETL job scheduling</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="schedule_enabled"
              checked={config.schedule_enabled}
              onChange={(e) => handleInputChange("schedule_enabled", e.target.checked)}
              className="w-4 h-4"
            />
            <Label htmlFor="schedule_enabled">Enable Scheduled Jobs</Label>
          </div>
          {config.schedule_enabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="schedule_type">Schedule Type</Label>
                <select
                  id="schedule_type"
                  value={config.schedule_type}
                  onChange={(e) => handleInputChange("schedule_type", e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="frequency">Frequency-based</option>
                  <option value="cron">Cron Expression</option>
                </select>
              </div>
              {config.schedule_type === "frequency" && (
                <div className="space-y-2">
                  <Label htmlFor="frequency_seconds">Frequency (seconds)</Label>
                  <Input
                    id="frequency_seconds"
                    type="number"
                    value={config.frequency_seconds}
                    onChange={(e) => handleInputChange("frequency_seconds", parseInt(e.target.value))}
                    placeholder="300"
                  />
                  <p className="text-xs text-muted-foreground">
                    Current: Every {Math.floor(config.frequency_seconds / 60)} minutes
                  </p>
                </div>
              )}
              {config.schedule_type === "cron" && (
                <div className="space-y-2">
                  <Label htmlFor="cron_expression">Cron Expression</Label>
                  <Input
                    id="cron_expression"
                    value={config.cron_expression}
                    onChange={(e) => handleInputChange("cron_expression", e.target.value)}
                    placeholder="0 0 * * *"
                  />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-4">
        <Button onClick={handleSaveConfig} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Save Configuration
        </Button>
        <Button onClick={handleRunManualJob} variant="outline">
          <Play className="w-4 h-4 mr-2" />
          Run Job Now
        </Button>
        {config.schedule_enabled && (
          <>
            {schedulerStatus?.is_running ? (
              <Button onClick={handleStopScheduler} variant="destructive">
                <Square className="w-4 h-4 mr-2" />
                Stop Scheduler
              </Button>
            ) : (
              <Button onClick={handleStartScheduler} variant="default">
                <Play className="w-4 h-4 mr-2" />
                Start Scheduler
              </Button>
            )}
          </>
        )}
        {/* Always show stop button if scheduler is running */}
        {!config.schedule_enabled && schedulerStatus?.is_running && (
          <Button onClick={handleStopScheduler} variant="destructive">
            <Square className="w-4 h-4 mr-2" />
            Stop Scheduler
          </Button>
        )}
      </div>
    </div>
  );
}
