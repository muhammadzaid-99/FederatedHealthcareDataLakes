'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard-shell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, RefreshCw, Terminal } from 'lucide-react';
import { api } from '@/lib/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

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
  if (!end) return 'In progress…';
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

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function ETLJobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<ETLJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [limit] = useState(5);

  /* ---------- data fetching ---------- */

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/etl/jobs?offset=${offset}&limit=${limit}`);
      setJobs(res.jobs ?? []);
      setTotal(res.total ?? 0);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Failed to load ETL jobs';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [offset, limit]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  /* ---------- pagination helpers ---------- */

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  /* ---------- actions (header) ---------- */

  const RefreshButton = (
    <Button
      variant="outline"
      size="sm"
      onClick={() => loadJobs()}
      disabled={loading}
      className="gap-2"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <RefreshCw className="h-4 w-4" />
      )}
      Refresh
    </Button>
  );

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <DashboardShell
      title="ETL Jobs"
      description="Monitor and manage ETL job executions"
      actions={RefreshButton}
    >
      {/* error banner */}
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* ---- jobs table ---- */}
      {!loading && jobs.length === 0 && !error ? (
        /* empty state */
        <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-12 text-center">
          <Terminal className="mx-auto h-10 w-10 text-slate-400" />
          <h3 className="mt-4 text-lg font-semibold text-slate-700">
            No ETL jobs found
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Run your first ETL job to see executions here.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Start Time</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Records</TableHead>
                <TableHead>Date Range</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-blue-500" />
                  </TableCell>
                </TableRow>
              ) : (
                jobs.map((job) => (
                  <TableRow
                    key={job.id}
                    className="cursor-pointer hover:bg-slate-50/60"
                    onClick={() => router.push(`/etl/jobs/${job.id}`)}
                  >
                    <TableCell>{getStatusBadge(job.status)}</TableCell>
                    <TableCell className="font-medium">{job.stage}</TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {formatDateTime(job.start_time)}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {formatDuration(job.start_time, job.end_time)}
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="text-emerald-600">
                        {job.records_extracted}
                      </span>
                      {' / '}
                      <span className="text-blue-600">
                        {job.records_validated}
                      </span>
                      {' / '}
                      <span className="text-rose-600">
                        {job.records_failed}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {job.date_range_start && job.date_range_end
                        ? `${formatDateTime(job.date_range_start)} – ${formatDateTime(job.date_range_end)}`
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
              <span>
                Page {currentPage} of {totalPages} ({total} jobs)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset === 0}
                  onClick={() => setOffset((o) => Math.max(0, o - limit))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset + limit >= total}
                  onClick={() => setOffset((o) => o + limit)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

    </DashboardShell>
  );
}
