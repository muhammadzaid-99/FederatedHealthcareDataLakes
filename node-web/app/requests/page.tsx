'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api, storage } from '@/lib/api';
import { DashboardShell } from '@/components/dashboard-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import {
  FileText,
  Loader2,
  Check,
  X,
  RefreshCw,
  Shield,
  Calendar as CalendarIcon,
  Inbox,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DataRequest {
  id: string;
  message_id: string;
  requestor_id: string;
  request_type: string;
  status: 'pending' | 'approved' | 'rejected';
  approved_at?: string;
  rejected_at?: string;
  approved_by?: string;
  rejected_by?: string;
  date_range_start?: string;
  date_range_end?: string;
  policy_json?: string;
  credentials_json?: string;
  request_payload?: string;
  notes?: string;
  created_at: string;
}

interface RequestPayload {
  type?: string;
  request_id?: string;
  requestor_id?: string;
  requestor_name?: string;
  requestor_email?: string;
  requestor_org?: string;
  departments?: string[];
  purpose?: string;
  expires_at?: string;
  created_at?: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEPARTMENTS = ['Cardiology', 'Gynecology', 'Neurology', 'Orthopedics', 'Pediatrics'];

const STATUS_FILTERS = ['all', 'pending', 'approved', 'rejected'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function statusDot(status: string) {
  const colors: Record<string, string> = {
    pending: 'bg-amber-500',
    approved: 'bg-emerald-500',
    rejected: 'bg-rose-500',
  };
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${colors[status] ?? 'bg-slate-400'}`} />;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-amber-50 text-amber-700 border border-amber-200',
    approved: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    rejected: 'bg-rose-50 text-rose-700 border border-rose-200',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[status] ?? 'bg-slate-100 text-slate-600'}`}
    >
      {statusDot(status)}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function cardBorder(status: string) {
  const map: Record<string, string> = {
    pending: 'border-l-4 border-l-amber-400',
    approved: 'border-l-4 border-l-emerald-400',
    rejected: 'border-l-4 border-l-rose-400',
  };
  return map[status] ?? '';
}

function parseRequestPayload(payload?: string): RequestPayload | null {
  if (!payload) return null;
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function RequestsPage() {
  const router = useRouter();

  /* ---- list state ---- */
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<DataRequest[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  /* ---- approve modal ---- */
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<DataRequest | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [credentialExpirySeconds, setCredentialExpirySeconds] = useState<number>(3600);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [approving, setApproving] = useState(false);
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [approveError, setApproveError] = useState<string | null>(null);

  /* ---- reject modal ---- */
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectionNotes, setRejectionNotes] = useState('');
  const [rejecting, setRejecting] = useState(false);

  /* ---- details modal ---- */
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [viewingRequest, setViewingRequest] = useState<DataRequest | null>(null);

  /* ================================================================ */
  /*  Data fetching                                                    */
  /* ================================================================ */

  const fetchRequests = useCallback(async () => {
    const token = storage.getToken();
    if (!token) return;

    try {
      setRefreshing(true);
      const status = filter === 'all' ? undefined : filter;
      const response = await api.listDataRequests(token, status);
      setRequests(response.requests || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch requests');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    const token = storage.getToken();
    if (!token) {
      router.push('/login');
      return;
    }
    fetchRequests();
  }, [router, fetchRequests]);

  /* ================================================================ */
  /*  Handlers                                                         */
  /* ================================================================ */

  const handleApprove = async () => {
    if (!selectedRequest || !dateRange?.from || !dateRange?.to) return;

    const token = storage.getToken();
    if (!token) return;

    try {
      setApproving(true);
      setApproveError(null);
      const user = storage.getUserInfo();
      await api.approveDataRequest(token, selectedRequest.id, {
        approved_by: user?.username || 'admin',
        departments: selectedDepartments,
        date_range_start: format(dateRange.from, 'yyyy-MM-dd'),
        date_range_end: format(dateRange.to, 'yyyy-MM-dd'),
        duration_seconds: credentialExpirySeconds,
        notes: approvalNotes,
      });
      setApproveModalOpen(false);
      setSelectedRequest(null);
      setDateRange(undefined);
      setSelectedDepartments([]);
      setCredentialExpirySeconds(3600);
      setApprovalNotes('');
      setApproveError(null);
      fetchRequests();
    } catch (err) {
      console.log(err);
      const message = err instanceof Error ? err.message : 'Failed to approve request';
      // Show policy-size errors inside the modal, not the global banner
      setApproveError(message);
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest) return;

    const token = storage.getToken();
    if (!token) return;

    try {
      setRejecting(true);
      const user = storage.getUserInfo();
      await api.rejectDataRequest(token, selectedRequest.id, {
        rejected_by: user?.username || 'admin',
        notes: rejectionNotes,
      });
      setRejectModalOpen(false);
      setSelectedRequest(null);
      setRejectionNotes('');
      fetchRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject request');
    } finally {
      setRejecting(false);
    }
  };

  const openApproveModal = (request: DataRequest) => {
    setSelectedRequest(request);
    setDateRange(undefined);
    setSelectedDepartments([]);
    setCredentialExpirySeconds(3600);
    setApprovalNotes('');
    setApproveError(null);
    setApproveModalOpen(true);
  };

  const openRejectModal = (request: DataRequest) => {
    setSelectedRequest(request);
    setRejectionNotes('');
    setRejectModalOpen(true);
  };

  const openDetailsModal = (request: DataRequest) => {
    setViewingRequest(request);
    setDetailsModalOpen(true);
  };

  /* ================================================================ */
  /*  Derived counts                                                   */
  /* ================================================================ */

  const counts: Record<string, number> = {
    all: requests.length,
    pending: requests.filter((r) => r.status === 'pending').length,
    approved: requests.filter((r) => r.status === 'approved').length,
    rejected: requests.filter((r) => r.status === 'rejected').length,
  };

  /* ================================================================ */
  /*  Loading state                                                    */
  /* ================================================================ */

  if (loading) {
    return (
      <DashboardShell title="Data Requests" description="Manage incoming data access requests">
        <div className="flex flex-col items-center justify-center py-32">
          <Loader2 className="h-10 w-10 text-blue-600 animate-spin mb-4" />
          <p className="text-sm text-slate-500">Loading requests…</p>
        </div>
      </DashboardShell>
    );
  }

  /* ================================================================ */
  /*  Main render                                                      */
  /* ================================================================ */

  return (
    <DashboardShell
      title="Data Requests"
      description="Manage incoming data access requests from researchers"
      actions={
        <Button
          size="sm"
          variant="outline"
          className="rounded-xl border-slate-200"
          onClick={fetchRequests}
          disabled={refreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      }
    >
      {/* ---- Error banner ---- */}
      {error && (
        <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* ---- Filter tabs ---- */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {STATUS_FILTERS.map((s) => {
          const active = filter === s;
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors
                ${active ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
              {counts[s] > 0 && (
                <span
                  className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none
                    ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}
                >
                  {counts[s]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ---- Request list / empty state ---- */}
      {requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-20">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
            <Inbox className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="text-base font-semibold text-slate-700">No Requests</h3>
          <p className="mt-1 text-sm text-slate-500">
            {filter === 'all'
              ? 'No data access requests have been received yet'
              : `No ${filter} requests found`}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => {
            const payload = parseRequestPayload(request.request_payload);
            const requestorName = payload?.requestor_name || request.requestor_id;
            return (
              <div
                key={request.id}
                className={`rounded-2xl border border-slate-200 bg-white hover:shadow-md transition-shadow ${cardBorder(request.status)}`}
              >
                <div className="p-5">
                  <div className="flex justify-between items-start gap-4">
                    {/* Left content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-3 mb-2">
                        <StatusBadge status={request.status} />
                        <span className="text-xs text-slate-400">
                          {new Date(request.created_at).toLocaleString()}
                        </span>
                      </div>

                      <h3 className="text-base font-semibold text-slate-900 mb-1 truncate">
                        Request from: {requestorName}
                      </h3>

                      {payload?.requestor_org && (
                        <p className="text-xs text-slate-500 mb-1">
                          {payload.requestor_org}
                        </p>
                      )}

                      <p className="text-sm text-slate-500 mb-1">
                        Type:{' '}
                        <span className="font-medium text-slate-600">
                          {request.request_type || 'Data Access'}
                        </span>
                      </p>

                      {payload?.purpose && (
                        <p className="text-sm text-slate-500 mt-1">
                          Purpose: {payload.purpose}
                        </p>
                      )}

                      {request.notes && (
                        <p className="text-sm text-slate-500 italic mt-1">Notes: {request.notes}</p>
                      )}

                      {request.date_range_start && request.date_range_end && (
                        <p className="flex items-center gap-1.5 text-sm text-slate-500 mt-2">
                          <CalendarIcon className="h-3.5 w-3.5 text-slate-400" />
                          {request.date_range_start} → {request.date_range_end}
                        </p>
                      )}
                    </div>

                    {/* Right actions */}
                    <div className="flex flex-col gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-xl border-slate-200"
                        onClick={() => openDetailsModal(request)}
                      >
                        <FileText className="h-4 w-4 mr-1" />
                        Details
                      </Button>
                      {request.status === 'pending' && (
                        <>
                          <Button
                            size="sm"
                            className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => openApproveModal(request)}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="rounded-xl"
                            onClick={() => openRejectModal(request)}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Reject
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ============================================================ */}
      {/*  Approve Modal                                                */}
      {/* ============================================================ */}
      <Dialog open={approveModalOpen} onOpenChange={setApproveModalOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-slate-900">Approve Data Request</DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              Select the date range for data access. The requestor will receive temporary credentials that only grant
              access to data within this range.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-4">
            {/* Date range */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 block">
                Date Range for Data Access
              </label>
              <div className="flex justify-center">
                <DateRangePicker value={dateRange} onChange={setDateRange} />
              </div>
            </div>

            {/* Departments */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 block">
                Departments to Grant Access
              </label>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center mb-3 pb-3 border-b border-slate-200">
                  <input
                    type="checkbox"
                    id="select-all-depts"
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    checked={selectedDepartments.length === DEPARTMENTS.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedDepartments([...DEPARTMENTS]);
                      } else {
                        setSelectedDepartments([]);
                      }
                    }}
                  />
                  <label htmlFor="select-all-depts" className="ml-2 text-sm font-medium text-slate-700">
                    Select All
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {DEPARTMENTS.map((dept) => (
                    <div key={dept} className="flex items-center">
                      <input
                        type="checkbox"
                        id={`dept-${dept}`}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        checked={selectedDepartments.includes(dept)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedDepartments([...selectedDepartments, dept]);
                          } else {
                            setSelectedDepartments(selectedDepartments.filter((d) => d !== dept));
                          }
                        }}
                      />
                      <label htmlFor={`dept-${dept}`} className="ml-2 text-sm text-slate-600">
                        {dept}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              <p className="mt-1.5 text-xs text-slate-400">
                Selected:{' '}
                {selectedDepartments.length === 0
                  ? 'None (no access will be granted)'
                  : selectedDepartments.join(', ')}
              </p>
            </div>

            {/* Credential expiry */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 block">
                Credential Expiry (seconds)
              </label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={900}
                  max={604800}
                  className="flex-1 rounded-xl border-slate-200"
                  value={credentialExpirySeconds}
                  onChange={(e) => setCredentialExpirySeconds(Number(e.target.value))}
                />
                <span className="text-xs text-slate-400 whitespace-nowrap">
                  ({Math.floor(credentialExpirySeconds / 3600)}h{' '}
                  {Math.floor((credentialExpirySeconds % 3600) / 60)}m)
                </span>
              </div>
              <p className="mt-1.5 text-xs text-slate-400">
                Min: 900 (15 min) · Max: 604800 (7 days) · Default: 3600 (1 hour)
              </p>
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 block">
                Notes (optional)
              </label>
              <textarea
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="Add any notes about this approval…"
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
              />
            </div>
          </div>

          {approveError && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <p className="font-semibold mb-1">Approval failed</p>
              <p>{approveError}</p>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => setApproveModalOpen(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleApprove}
              disabled={!dateRange?.from || !dateRange?.to || approving}
            >
              {approving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Approving…
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Approve Request
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/*  Reject Modal                                                 */}
      {/* ============================================================ */}
      <Dialog open={rejectModalOpen} onOpenChange={setRejectModalOpen}>
        <DialogContent className="sm:max-w-[440px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-slate-900">Reject Data Request</DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              Please provide a reason for rejecting this request.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 block">
              Rejection Reason
            </label>
            <textarea
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
              rows={3}
              placeholder="Enter the reason for rejection…"
              value={rejectionNotes}
              onChange={(e) => setRejectionNotes(e.target.value)}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => setRejectModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl"
              onClick={handleReject}
              disabled={rejecting}
            >
              {rejecting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Rejecting…
                </>
              ) : (
                <>
                  <X className="h-4 w-4 mr-2" />
                  Reject Request
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/*  Request Details Modal                                       */}
      {/* ============================================================ */}
      <Dialog open={detailsModalOpen} onOpenChange={setDetailsModalOpen}>
        <DialogContent className="sm:max-w-[760px] max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Shield className="h-5 w-5 text-emerald-600" />
              Request Details
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              Review the request metadata and IAM policy. No keys or tokens are shown here.
            </DialogDescription>
          </DialogHeader>

          {viewingRequest && (() => {
            const payload = parseRequestPayload(viewingRequest.request_payload);
            const requestorName = payload?.requestor_name || viewingRequest.requestor_id;
            const policyText = viewingRequest.policy_json
              ? (() => {
                  try {
                    return JSON.stringify(JSON.parse(viewingRequest.policy_json), null, 2);
                  } catch {
                    return viewingRequest.policy_json;
                  }
                })()
              : null;

            return (
              <div className="space-y-5 py-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Requestor
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-800">{requestorName}</p>
                    {payload?.requestor_org && (
                      <p className="text-xs text-slate-500 mt-1">{payload.requestor_org}</p>
                    )}
                    {payload?.requestor_email && (
                      <p className="text-xs text-slate-500 mt-1">{payload.requestor_email}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-2 break-all">ID: {viewingRequest.requestor_id}</p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Request Summary
                    </p>
                    <p className="mt-2 text-sm text-slate-700">
                      Status: <span className="font-semibold">{viewingRequest.status}</span>
                    </p>
                    <p className="mt-1 text-sm text-slate-700">
                      Type: <span className="font-semibold">{viewingRequest.request_type || 'Data Access'}</span>
                    </p>
                    {payload?.request_id && (
                      <p className="mt-1 text-xs text-slate-500 break-all">
                        Request ID: {payload.request_id}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">
                      Created: {new Date(viewingRequest.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>

                {payload?.purpose && (
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Purpose</p>
                    <p className="mt-2 text-sm text-slate-700">{payload.purpose}</p>
                  </div>
                )}

                {payload?.departments && payload.departments.length > 0 && (
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Departments</p>
                    <p className="mt-2 text-sm text-slate-700">
                      {payload.departments.join(', ')}
                    </p>
                  </div>
                )}

                {viewingRequest.date_range_start && viewingRequest.date_range_end && (
                  <div className="flex items-center gap-2 rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
                    <CalendarIcon className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-800">
                      Data Access Period: {viewingRequest.date_range_start} → {viewingRequest.date_range_end}
                    </span>
                  </div>
                )}

                {payload?.expires_at && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <p className="text-sm text-amber-800">
                      <span className="font-semibold">Request Expires:</span>{' '}
                      {new Date(payload.expires_at).toLocaleString()}
                    </p>
                  </div>
                )}

                {viewingRequest.notes && (
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Notes</p>
                    <p className="mt-2 text-sm text-slate-700">{viewingRequest.notes}</p>
                  </div>
                )}

                {policyText && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                      IAM Policy
                    </p>
                    <pre className="overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs font-mono text-emerald-400 whitespace-pre-wrap break-words">
                      {policyText}
                    </pre>
                  </div>
                )}
              </div>
            );
          })()}

          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setDetailsModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
