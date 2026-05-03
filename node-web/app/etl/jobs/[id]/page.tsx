'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard-shell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';

interface ETLJob {
  id: string;
  status: string;
  stage: string;
  start_time: string;
  end_time?: string;
  records_extracted: number;
  records_validated: number;
  records_failed: number;
  staging_path?: string;
  normalized_path?: string;
  validated_path?: string;
  message?: string;
  logs?: string;
  date_range_start?: string;
  date_range_end?: string;
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'completed':
      return (
        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-200">
          Completed
        </Badge>
      );
    case 'running':
      return (
        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-200 border-amber-200 animate-pulse">
          Running
        </Badge>
      );
    case 'failed':
      return (
        <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-200 border-rose-200">
          Failed
        </Badge>
      );
    default:
      return (
        <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200">
          {status}
        </Badge>
      );
  }
}

function formatDateTime(str?: string): string {
  if (!str) return 'N/A';
  try {
    return new Date(str).toLocaleString();
  } catch {
    return 'N/A';
  }
}

function formatDuration(start?: string, end?: string): string {
  if (!start) return 'N/A';
  if (!end) return 'In progress...';
  try {
    const seconds = Math.round(
      (new Date(end).getTime() - new Date(start).getTime()) / 1000,
    );
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  } catch {
    return 'N/A';
  }
}

export default function ETLJobDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const [job, setJob] = useState<ETLJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadJob = useCallback(
    async (silent = false) => {
      if (!jobId) return;
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const res = await api.get(`/etl/jobs/${jobId}`);
        setJob(res.job || null);
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : 'Failed to load job details';
        setError(msg);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [jobId]
  );

  useEffect(() => {
    if (!jobId) return;
    loadJob();
    const interval = setInterval(() => loadJob(true), 5000);
    return () => clearInterval(interval);
  }, [jobId, loadJob]);

  const headerActions = (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => router.push('/etl/jobs')}
        className="gap-2"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Jobs
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => loadJob(true)}
        disabled={refreshing}
        className="gap-2"
      >
        {refreshing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        Refresh
      </Button>
    </div>
  );

  if (loading && !job) {
    return (
      <DashboardShell
        title="ETL Job Details"
        description="Loading job data…"
        actions={headerActions}
      >
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      title="ETL Job Details"
      description="Live updates every 5 seconds"
      actions={headerActions}
    >
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {job && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: 'ID', value: job.id },
              { label: 'Status', value: job.status, badge: true },
              { label: 'Stage', value: job.stage },
              { label: 'Duration', value: formatDuration(job.start_time, job.end_time) },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-slate-100 bg-slate-50 p-3"
              >
                <p className="text-xs text-slate-500">{item.label}</p>
                {item.badge ? (
                  <div className="mt-1">{getStatusBadge(item.value)}</div>
                ) : (
                  <p className="mt-1 text-sm font-medium text-slate-800 break-all">
                    {item.value}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: 'Start Time', value: formatDateTime(job.start_time) },
              { label: 'End Time', value: formatDateTime(job.end_time) },
              {
                label: 'Date Range',
                value:
                  job.date_range_start && job.date_range_end
                    ? `${formatDateTime(job.date_range_start)} - ${formatDateTime(job.date_range_end)}`
                    : '—',
              },
              { label: 'Updated', value: formatDateTime(job.end_time || job.start_time) },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-slate-100 bg-slate-50 p-3"
              >
                <p className="text-xs text-slate-500">{item.label}</p>
                <p className="mt-1 text-sm font-medium text-slate-800 break-all">
                  {item.value}
                </p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Extracted', value: job.records_extracted, color: 'text-teal-600' },
              { label: 'Validated', value: job.records_validated, color: 'text-blue-600' },
              { label: 'Failed', value: job.records_failed, color: 'text-rose-600' },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-center"
              >
                <p className="text-xs text-slate-500">{stat.label}</p>
                <p className={`mt-1 text-2xl font-bold ${stat.color}`}>
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          {job.message && (
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-medium text-slate-500 mb-1">Message</p>
              <p className="text-sm text-slate-700">{job.message}</p>
            </div>
          )}

          {(job.staging_path || job.normalized_path || job.validated_path) && (
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-2">
              <p className="text-xs font-medium text-slate-500 mb-2">File Paths</p>
              {[
                { label: 'Staging', path: job.staging_path },
                { label: 'Normalized', path: job.normalized_path },
                { label: 'Validated', path: job.validated_path },
              ]
                .filter((f) => f.path)
                .map((f) => (
                  <div key={f.label} className="flex gap-2 text-sm">
                    <span className="text-slate-500 min-w-[90px]">
                      {f.label}:
                    </span>
                    <span className="font-mono text-slate-700 break-all">
                      {f.path}
                    </span>
                  </div>
                ))}
            </div>
          )}

          {job.logs && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-2">Logs</p>
              <pre className="bg-slate-900 rounded-xl p-4 text-emerald-400 font-mono text-xs max-h-80 overflow-auto whitespace-pre-wrap">
                {job.logs}
              </pre>
            </div>
          )}
        </div>
      )}
    </DashboardShell>
  );
}
