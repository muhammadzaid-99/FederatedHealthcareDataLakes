"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw, Eye, CheckCircle, XCircle, Clock, PlayCircle } from "lucide-react";
import {api} from "@/lib/api";

interface ETLJob {
  id: string;
  config_id: string;
  start_time: string;
  end_time?: string;
  date_range_start: string;
  date_range_end: string;
  status: string;
  stage: string;
  message: string;
  records_extracted: number;
  records_validated: number;
  records_failed: number;
  staging_path: string;
  normalized_path: string;
  validated_path: string;
  logs: string;
  created_at: string;
}

export default function ETLJobsPage() {
  const [jobs, setJobs] = useState<ETLJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState<ETLJob | null>(null);
  const [total, setTotal] = useState(0);
  const [limit] = useState(20);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    loadJobs();
    const interval = setInterval(loadJobs, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, [offset]);

  const loadJobs = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/etl/jobs?limit=${limit}&offset=${offset}`);
      setJobs(response.data.jobs || []);
      setTotal(response.data.total || 0);
    } catch (error) {
      console.error("Failed to load jobs:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadJobDetails = async (jobId: string) => {
    try {
      const response = await api.get(`/etl/jobs/${jobId}`);
      setSelectedJob(response.data.job);
    } catch (error) {
      console.error("Failed to load job details:", error);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" /> Completed</Badge>;
      case "running":
        return <Badge className="bg-blue-500"><PlayCircle className="w-3 h-3 mr-1" /> Running</Badge>;
      case "failed":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" /> Failed</Badge>;
      case "pending":
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDuration = (start: string, end?: string) => {
    const startTime = new Date(start).getTime();
    const endTime = end ? new Date(end).getTime() : Date.now();
    const duration = Math.floor((endTime - startTime) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    return `${minutes}m ${seconds}s`;
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">ETL Jobs</h1>
          <p className="text-muted-foreground">Monitor and manage ETL job executions</p>
        </div>
        <Button onClick={loadJobs} disabled={loading} variant="outline">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Job List */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Jobs</CardTitle>
          <CardDescription>
            Showing {jobs.length} of {total} jobs
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && jobs.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No ETL jobs found. Run your first job from the configuration page.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Start Time</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Records</TableHead>
                  <TableHead>Date Range</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>{getStatusBadge(job.status)}</TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">{job.stage}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{formatDateTime(job.start_time)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{formatDuration(job.start_time, job.end_time)}</span>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm space-y-1">
                        {job.records_extracted > 0 && (
                          <div>Extracted: {job.records_extracted}</div>
                        )}
                        {job.records_validated > 0 && (
                          <div className="text-green-600">Validated: {job.records_validated}</div>
                        )}
                        {job.records_failed > 0 && (
                          <div className="text-red-600">Failed: {job.records_failed}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-muted-foreground">
                        <div>{formatDateTime(job.date_range_start)}</div>
                        <div>to {formatDateTime(job.date_range_end)}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => loadJobDetails(job.id)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Pagination */}
          {total > limit && (
            <div className="flex justify-between items-center mt-4">
              <Button
                variant="outline"
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {Math.floor(offset / limit) + 1} of {Math.ceil(total / limit)}
              </span>
              <Button
                variant="outline"
                onClick={() => setOffset(offset + limit)}
                disabled={offset + limit >= total}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Job Details Modal */}
      {selectedJob && (
        <Card className="border-2">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Job Details</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setSelectedJob(null)}>
                Close
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Job ID</p>
                <p className="text-sm font-mono">{selectedJob.id}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Status</p>
                {getStatusBadge(selectedJob.status)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Stage</p>
                <p className="text-sm">{selectedJob.stage}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Duration</p>
                <p className="text-sm">{formatDuration(selectedJob.start_time, selectedJob.end_time)}</p>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">Processing Statistics</p>
              <div className="grid grid-cols-3 gap-4">
                <div className="border rounded p-3">
                  <p className="text-xs text-muted-foreground">Extracted</p>
                  <p className="text-2xl font-bold">{selectedJob.records_extracted}</p>
                </div>
                <div className="border rounded p-3">
                  <p className="text-xs text-muted-foreground">Validated</p>
                  <p className="text-2xl font-bold text-green-600">{selectedJob.records_validated}</p>
                </div>
                <div className="border rounded p-3">
                  <p className="text-xs text-muted-foreground">Failed</p>
                  <p className="text-2xl font-bold text-red-600">{selectedJob.records_failed}</p>
                </div>
              </div>
            </div>

            {selectedJob.message && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Message</p>
                <p className="text-sm mt-1 p-2 bg-muted rounded">{selectedJob.message}</p>
              </div>
            )}

            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">File Paths</p>
              <div className="space-y-2 text-xs">
                {selectedJob.staging_path && (
                  <div>
                    <span className="font-medium">Staging:</span>{" "}
                    <span className="font-mono text-muted-foreground">{selectedJob.staging_path}</span>
                  </div>
                )}
                {selectedJob.normalized_path && (
                  <div>
                    <span className="font-medium">Normalized:</span>{" "}
                    <span className="font-mono text-muted-foreground">{selectedJob.normalized_path}</span>
                  </div>
                )}
                {selectedJob.validated_path && (
                  <div>
                    <span className="font-medium">Validated:</span>{" "}
                    <span className="font-mono text-muted-foreground">{selectedJob.validated_path}</span>
                  </div>
                )}
              </div>
            </div>

            {selectedJob.logs && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Logs</p>
                <pre className="text-xs bg-black text-green-400 p-4 rounded overflow-x-auto max-h-64">
                  {selectedJob.logs}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
