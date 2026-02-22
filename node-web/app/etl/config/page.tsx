"use client";

import { useState, useEffect } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Play,
  Square,
  Database,
  HardDrive,
  Terminal,
  Clock,
  Zap,
  Activity,
  Save,
  FlaskConical,
  ServerCrash,
} from "lucide-react";
import { formatDateTimeString, formatTimeString } from "@/lib/utils";
import { api } from "@/lib/api";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Defaults                                                           */
/* ------------------------------------------------------------------ */

const DEFAULT_CONFIG: ETLConfig = {
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
  scripts_path:
    "/home/muhammad-zaid/Documents/hms_fyp/hms-dls2/node-backend/scripts",
  jdbc_path:
    "/home/muhammad-zaid/Documents/hms_fyp/hms-dls2/node-backend/scripts/postgresql-42.7.7.jar",
  schedule_enabled: false,
  schedule_type: "frequency",
  frequency_seconds: 300,
  cron_expression: "",
  output_dir:
    "/home/muhammad-zaid/Documents/hms_fyp/hms-dls2/node-backend/parquet",
  departments: ["cardiology", "neurology"],
  enrichment_version: "v1",
};

/* ------------------------------------------------------------------ */
/*  Reusable card wrapper                                              */
/* ------------------------------------------------------------------ */

function SectionCard({
  icon,
  iconBg,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center gap-4 border-b border-slate-100 px-6 py-5">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconBg}`}>
          {icon}
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {subtitle && (
            <p className="text-sm text-slate-500">{subtitle}</p>
          )}
        </div>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Row helper                                                         */
/* ------------------------------------------------------------------ */

function StatusRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm font-medium text-slate-600">{label}</span>
      <span className="text-sm text-slate-900">{children}</span>
    </div>
  );
}

/* ================================================================== */
/*  Page component                                                     */
/* ================================================================== */

export default function ETLConfigPage() {
  const [config, setConfig] = useState<ETLConfig>({ ...DEFAULT_CONFIG });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);
  const [hasDbPassword, setHasDbPassword] = useState(false);
  const [hasMinioSecret, setHasMinioSecret] = useState(false);

  /* ---- helpers --------------------------------------------------- */

  const handleInputChange = (field: keyof ETLConfig, value: any) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  /* ---- data fetching --------------------------------------------- */

  const loadConfig = async () => {
    setLoading(true);
    try {
      const response = await api.get("/etl/config");
      console.log("Load config response:", response);
      if (response.config) {
        const loadedConfig = {
          ...response.config,
          db_password: "",
          minio_secret_key: "",
        };
        setConfig(loadedConfig);
        setHasDbPassword(response.has_db_password || false);
        setHasMinioSecret(response.has_minio_secret || false);
      }
    } catch (error: any) {
      if (
        error.message?.includes("404") ||
        error.message?.includes("not configured")
      ) {
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

  useEffect(() => {
    loadConfig();
    loadSchedulerStatus();
    const interval = setInterval(loadSchedulerStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  /* ---- handlers -------------------------------------------------- */

  const handleSaveConfig = async () => {
    setSaving(true);
    setTestResult(null);
    try {
      console.log("Saving", config);
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
      setTestResult({
        success: response.success || false,
        message: response.message || "Unknown response",
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
      alert(
        `Failed to start scheduler: ${error.response?.data?.error || error.message}`
      );
    }
  };

  const handleStopScheduler = async () => {
    try {
      await api.post("/etl/scheduler/stop");
      alert("ETL scheduler stopped successfully!");
      loadSchedulerStatus();
    } catch (error: any) {
      alert(
        `Failed to stop scheduler: ${error.response?.data?.error || error.message}`
      );
    }
  };

  const handleRunManualJob = async () => {
    try {
      await api.post("/etl/jobs/run");
      alert("ETL job started! Check the Jobs page for progress.");
    } catch (error: any) {
      alert(
        `Failed to start job: ${error.response?.data?.error || error.message}`
      );
    }
  };

  /* ---- loading state --------------------------------------------- */

  if (loading) {
    return (
      <DashboardShell title="ETL Configuration" description="Loading…">
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </DashboardShell>
    );
  }

  /* ---- header badges & actions ----------------------------------- */

  const headerActions = (
    <div className="flex items-center gap-2">
      {schedulerStatus && (
        <>
          <Badge
            className={
              schedulerStatus.is_running
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-slate-100 text-slate-600"
            }
          >
            <span
              className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${
                schedulerStatus.is_running ? "bg-emerald-500" : "bg-slate-400"
              }`}
            />
            {schedulerStatus.is_running ? "Scheduler Running" : "Scheduler Stopped"}
          </Badge>
          {schedulerStatus.is_running && schedulerStatus.next_run && (
            <Badge className="border-blue-200 bg-blue-50 text-blue-700">
              Next: {formatTimeString(schedulerStatus.next_run)}
            </Badge>
          )}
        </>
      )}
    </div>
  );

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  return (
    <DashboardShell
      title="ETL Configuration"
      description="Configure data extraction, transformation, and loading settings"
      actions={headerActions}
    >
      <div className="mx-auto max-w-5xl space-y-6">
        {/* -------------------------------------------------------- */}
        {/*  1. Scheduler Status                                      */}
        {/* -------------------------------------------------------- */}
        {schedulerStatus && (
          <SectionCard
            icon={<Activity className="h-5 w-5 text-blue-600" />}
            iconBg="bg-blue-100"
            title="Scheduler Status"
            subtitle="Real-time overview of the ETL scheduler"
          >
            <div className="divide-y divide-slate-100">
              <StatusRow label="Status">
                <Badge
                  className={
                    schedulerStatus.is_running
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-slate-100 text-slate-600"
                  }
                >
                  {schedulerStatus.is_running ? "Running" : "Stopped"}
                </Badge>
              </StatusRow>

              {schedulerStatus.schedule_enabled && (
                <>
                  <StatusRow label="Schedule Type">
                    {schedulerStatus.schedule_type || "N/A"}
                  </StatusRow>

                  {schedulerStatus.frequency_seconds != null && (
                    <StatusRow label="Frequency">
                      Every {Math.floor(schedulerStatus.frequency_seconds / 60)} minutes
                    </StatusRow>
                  )}

                  {schedulerStatus.last_run && (
                    <StatusRow label="Last Run">
                      {formatDateTimeString(schedulerStatus.last_run)}
                    </StatusRow>
                  )}

                  {schedulerStatus.is_running && schedulerStatus.next_run && (
                    <StatusRow label="Next Run">
                      {formatDateTimeString(schedulerStatus.next_run)}
                    </StatusRow>
                  )}

                  {schedulerStatus.is_running &&
                    schedulerStatus.next_run_in_seconds !== undefined &&
                    schedulerStatus.next_run_in_seconds > 0 && (
                      <StatusRow label="Next Run In">
                        {Math.floor(schedulerStatus.next_run_in_seconds / 60)}m{" "}
                        {schedulerStatus.next_run_in_seconds % 60}s
                      </StatusRow>
                    )}
                </>
              )}
            </div>
          </SectionCard>
        )}

        {/* -------------------------------------------------------- */}
        {/*  2. Database Config                                       */}
        {/* -------------------------------------------------------- */}
        <SectionCard
          icon={<Database className="h-5 w-5 text-teal-600" />}
          iconBg="bg-teal-100"
          title="Database Configuration"
          subtitle="Source database for data extraction"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="db_host">Database Host</Label>
                <Input
                  id="db_host"
                  value={config.db_host}
                  onChange={(e) => handleInputChange("db_host", e.target.value)}
                  placeholder="localhost"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="db_port">Database Port</Label>
                <Input
                  id="db_port"
                  type="number"
                  value={config.db_port}
                  onChange={(e) =>
                    handleInputChange("db_port", parseInt(e.target.value))
                  }
                  placeholder="5432"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="db_name">Database Name</Label>
                <Input
                  id="db_name"
                  value={config.db_name}
                  onChange={(e) => handleInputChange("db_name", e.target.value)}
                  placeholder="hms"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="db_table">Table Name</Label>
                <Input
                  id="db_table"
                  value={config.db_table}
                  onChange={(e) =>
                    handleInputChange("db_table", e.target.value)
                  }
                  placeholder="checkups"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="db_user">Database User</Label>
                <Input
                  id="db_user"
                  value={config.db_user}
                  onChange={(e) => handleInputChange("db_user", e.target.value)}
                  placeholder="postgres"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="db_password">Database Password</Label>
                <Input
                  id="db_password"
                  type="password"
                  value={config.db_password}
                  onChange={(e) =>
                    handleInputChange("db_password", e.target.value)
                  }
                  placeholder={
                    hasDbPassword
                      ? "Enter new password to change"
                      : "Enter password"
                  }
                />
                {hasDbPassword && config.db_password === "" && (
                  <p className="text-xs font-medium text-emerald-600">
                    ✓ Password is set
                  </p>
                )}
              </div>
            </div>

            {/* Test Connection */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button
                variant="outline"
                onClick={handleTestConnection}
                disabled={testing}
                className="border-teal-200 text-teal-700 hover:bg-teal-50"
              >
                {testing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FlaskConical className="mr-2 h-4 w-4" />
                )}
                Test Connection
              </Button>

              {testResult && (
                <div className="flex items-center gap-2">
                  {testResult.success ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      <span className="text-sm text-emerald-600">
                        {testResult.message}
                      </span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-red-500" />
                      <span className="text-sm text-red-600">
                        {testResult.message}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </SectionCard>

        {/* -------------------------------------------------------- */}
        {/*  3. MinIO Config                                          */}
        {/* -------------------------------------------------------- */}
        <SectionCard
          icon={<HardDrive className="h-5 w-5 text-blue-600" />}
          iconBg="bg-blue-100"
          title="MinIO Configuration"
          subtitle="Object storage for processed data"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="minio_endpoint">MinIO Endpoint</Label>
                <Input
                  id="minio_endpoint"
                  value={config.minio_endpoint}
                  onChange={(e) =>
                    handleInputChange("minio_endpoint", e.target.value)
                  }
                  placeholder="http://localhost:9000"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="minio_bucket">Bucket Name</Label>
                <Input
                  id="minio_bucket"
                  value={config.minio_bucket}
                  onChange={(e) =>
                    handleInputChange("minio_bucket", e.target.value)
                  }
                  placeholder="hospital-data"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="minio_access_key">Access Key</Label>
                <Input
                  id="minio_access_key"
                  value={config.minio_access_key}
                  onChange={(e) =>
                    handleInputChange("minio_access_key", e.target.value)
                  }
                  placeholder="etluser"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="minio_secret_key">Secret Key</Label>
                <Input
                  id="minio_secret_key"
                  type="password"
                  value={config.minio_secret_key}
                  onChange={(e) =>
                    handleInputChange("minio_secret_key", e.target.value)
                  }
                  placeholder={
                    hasMinioSecret
                      ? "Enter new secret to change"
                      : "Enter secret key"
                  }
                />
                {hasMinioSecret && config.minio_secret_key === "" && (
                  <p className="text-xs font-medium text-emerald-600">
                    ✓ Secret key is set
                  </p>
                )}
              </div>
            </div>
          </div>
        </SectionCard>

        {/* -------------------------------------------------------- */}
        {/*  4. Python & Scripts                                      */}
        {/* -------------------------------------------------------- */}
        <SectionCard
          icon={<Terminal className="h-5 w-5 text-violet-600" />}
          iconBg="bg-violet-100"
          title="Python & Scripts"
          subtitle="Python environment and script paths"
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="python_path">Python Executable Path</Label>
              <Input
                id="python_path"
                value={config.python_path}
                onChange={(e) =>
                  handleInputChange("python_path", e.target.value)
                }
                placeholder="/path/to/python"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="scripts_path">Scripts Directory Path</Label>
              <Input
                id="scripts_path"
                value={config.scripts_path}
                onChange={(e) =>
                  handleInputChange("scripts_path", e.target.value)
                }
                placeholder="/path/to/scripts"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="jdbc_path">JDBC Driver Path</Label>
              <Input
                id="jdbc_path"
                value={config.jdbc_path}
                onChange={(e) => handleInputChange("jdbc_path", e.target.value)}
                placeholder="/path/to/postgresql.jar"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="output_dir">Output Directory</Label>
              <Input
                id="output_dir"
                value={config.output_dir}
                onChange={(e) =>
                  handleInputChange("output_dir", e.target.value)
                }
                placeholder="/path/to/output"
              />
            </div>
          </div>
        </SectionCard>

        {/* -------------------------------------------------------- */}
        {/*  5. Scheduling                                            */}
        {/* -------------------------------------------------------- */}
        <SectionCard
          icon={<Clock className="h-5 w-5 text-amber-600" />}
          iconBg="bg-amber-100"
          title="Scheduling"
          subtitle="Automatic ETL job scheduling"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="schedule_enabled"
                checked={config.schedule_enabled}
                onChange={(e) =>
                  handleInputChange("schedule_enabled", e.target.checked)
                }
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <Label htmlFor="schedule_enabled">Enable Scheduled Jobs</Label>
            </div>

            {config.schedule_enabled && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="schedule_type">Schedule Type</Label>
                  <select
                    id="schedule_type"
                    value={config.schedule_type}
                    onChange={(e) =>
                      handleInputChange("schedule_type", e.target.value)
                    }
                    className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="frequency">Frequency-based</option>
                    <option value="cron">Cron Expression</option>
                  </select>
                </div>

                {config.schedule_type === "frequency" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="frequency_seconds">
                      Frequency (seconds)
                    </Label>
                    <Input
                      id="frequency_seconds"
                      type="number"
                      value={config.frequency_seconds}
                      onChange={(e) =>
                        handleInputChange(
                          "frequency_seconds",
                          parseInt(e.target.value)
                        )
                      }
                      placeholder="300"
                    />
                    <p className="text-xs text-slate-500">
                      Current: Every{" "}
                      {Math.floor(config.frequency_seconds / 60)} minutes
                    </p>
                  </div>
                )}

                {config.schedule_type === "cron" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="cron_expression">Cron Expression</Label>
                    <Input
                      id="cron_expression"
                      value={config.cron_expression}
                      onChange={(e) =>
                        handleInputChange("cron_expression", e.target.value)
                      }
                      placeholder="0 0 * * *"
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </SectionCard>

        {/* -------------------------------------------------------- */}
        {/*  6. Actions                                               */}
        {/* -------------------------------------------------------- */}
        <SectionCard
          icon={<Zap className="h-5 w-5 text-rose-600" />}
          iconBg="bg-rose-100"
          title="Actions"
          subtitle="Save, run, and control the scheduler"
        >
          <div className="flex flex-wrap items-center gap-3">
            {/* Save */}
            <Button
              onClick={handleSaveConfig}
              disabled={saving}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Config
            </Button>

            {/* Run Now */}
            <Button
              variant="outline"
              onClick={handleRunManualJob}
              className="border-slate-200"
            >
              <Play className="mr-2 h-4 w-4" />
              Run Job Now
            </Button>

            {/* Start / Stop Scheduler */}
            {config.schedule_enabled && (
              <>
                {schedulerStatus?.is_running ? (
                  <Button
                    variant="outline"
                    onClick={handleStopScheduler}
                    className="border-red-200 text-red-700 hover:bg-red-50"
                  >
                    <Square className="mr-2 h-4 w-4" />
                    Stop Scheduler
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={handleStartScheduler}
                    className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                  >
                    <Play className="mr-2 h-4 w-4" />
                    Start Scheduler
                  </Button>
                )}
              </>
            )}

            {/* Always allow stop if scheduler is running but scheduling is disabled */}
            {!config.schedule_enabled && schedulerStatus?.is_running && (
              <Button
                variant="outline"
                onClick={handleStopScheduler}
                className="border-red-200 text-red-700 hover:bg-red-50"
              >
                <Square className="mr-2 h-4 w-4" />
                Stop Scheduler
              </Button>
            )}
          </div>
        </SectionCard>
      </div>
    </DashboardShell>
  );
}
