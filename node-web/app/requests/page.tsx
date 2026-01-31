'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api, storage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  ArrowLeft, 
  FileText, 
  Loader2, 
  Check, 
  X, 
  RefreshCw, 
  Clock, 
  CheckCircle, 
  XCircle,
  Key,
  Shield,
  Calendar as CalendarIcon,
  Copy
} from 'lucide-react';
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

interface Credentials {
  access_key_id: string;
  secret_access_key: string;
  session_token: string;
  expiration: string;
}

export default function RequestsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<DataRequest[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Approval modal state
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<DataRequest | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [credentialExpirySeconds, setCredentialExpirySeconds] = useState<number>(3600);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [approving, setApproving] = useState(false);

  // Rejection modal state
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectionNotes, setRejectionNotes] = useState('');
  const [rejecting, setRejecting] = useState(false);

  // Department selection state
  const DEPARTMENTS = ['Cardiology', 'Gynecology', 'Neurology', 'Orthopedics', 'Pediatrics'];
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);

  // Credentials modal state
  const [credentialsModalOpen, setCredentialsModalOpen] = useState(false);
  const [viewingRequest, setViewingRequest] = useState<DataRequest | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

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

  const handleApprove = async () => {
    if (!selectedRequest || !dateRange?.from || !dateRange?.to) return;
    
    const token = storage.getToken();
    if (!token) return;

    try {
      setApproving(true);
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
      fetchRequests();
    } catch (err) {
      console.log(err)
      setError(err instanceof Error ? err.message : 'Failed to approve request');
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
    setApproveModalOpen(true);
  };

  const openRejectModal = (request: DataRequest) => {
    setSelectedRequest(request);
    setRejectionNotes('');
    setRejectModalOpen(true);
  };

  const viewCredentials = (request: DataRequest) => {
    setViewingRequest(request);
    setCredentialsModalOpen(true);
  };

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </span>
        );
      case 'approved':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle className="h-3 w-3 mr-1" />
            Approved
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <XCircle className="h-3 w-3 mr-1" />
            Rejected
          </span>
        );
      default:
        return null;
    }
  };

  const parseCredentials = (json: string): Credentials | null => {
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading requests...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="container mx-auto px-4 py-8">
        <Button
          variant="ghost"
          onClick={() => router.push('/dashboard')}
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>

        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Data Access Requests</h1>
            <p className="text-gray-600">Manage incoming data access requests from researchers</p>
          </div>
          <Button onClick={fetchRequests} disabled={refreshing} variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex space-x-2 mb-6">
          {(['all', 'pending', 'approved', 'rejected'] as const).map((status) => (
            <Button
              key={status}
              variant={filter === status ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(status)}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
              {status !== 'all' && requests.filter(r => r.status === status).length > 0 && (
                <span className="ml-2 bg-white/20 px-2 py-0.5 rounded-full text-xs">
                  {requests.filter(r => r.status === status).length}
                </span>
              )}
            </Button>
          ))}
        </div>

        {/* Requests list */}
        {requests.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="h-5 w-5 mr-2 text-gray-600" />
                No Requests
              </CardTitle>
              <CardDescription>
                {filter === 'all' 
                  ? 'No data access requests have been received yet'
                  : `No ${filter} requests found`}
              </CardDescription>
            </CardHeader>
            <CardContent className="py-12 text-center">
              <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">Waiting for incoming requests...</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {requests.map((request) => (
              <Card key={request.id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        {getStatusBadge(request.status)}
                        <span className="text-sm text-gray-500">
                          {new Date(request.created_at).toLocaleString()}
                        </span>
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-1">
                        Request from: {request.requestor_id}
                      </h3>
                      <p className="text-sm text-gray-600 mb-2">
                        Type: {request.request_type || 'Data Access'}
                      </p>
                      {request.notes && (
                        <p className="text-sm text-gray-500 italic">
                          Notes: {request.notes}
                        </p>
                      )}
                      {request.date_range_start && request.date_range_end && (
                        <p className="text-sm text-gray-600 mt-2">
                          <CalendarIcon className="inline h-4 w-4 mr-1" />
                          Date Range: {request.date_range_start} to {request.date_range_end}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col space-y-2">
                      {request.status === 'pending' && (
                        <>
                          <Button size="sm" onClick={() => openApproveModal(request)}>
                            <Check className="h-4 w-4 mr-1" />
                            Approve
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => openRejectModal(request)}>
                            <X className="h-4 w-4 mr-1" />
                            Reject
                          </Button>
                        </>
                      )}
                      {request.status === 'approved' && request.credentials_json && (
                        <Button size="sm" variant="outline" onClick={() => viewCredentials(request)}>
                          <Key className="h-4 w-4 mr-1" />
                          View Credentials
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Approve Modal */}
        <Dialog open={approveModalOpen} onOpenChange={setApproveModalOpen}>
          <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Approve Data Request</DialogTitle>
              <DialogDescription>
                Select the date range for data access. The requestor will receive temporary credentials
                that only grant access to data within this range.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">
                  Date Range for Data Access
                </label>
                <div className="flex justify-center">
                  <DateRangePicker value={dateRange} onChange={setDateRange} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">
                  Departments to Grant Access
                </label>
                <div className="p-3 border border-gray-300 rounded-md">
                  <div className="flex items-center mb-2 pb-2 border-b border-gray-200">
                    <input
                      type="checkbox"
                      id="select-all-depts"
                      className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      checked={selectedDepartments.length === DEPARTMENTS.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedDepartments([...DEPARTMENTS]);
                        } else {
                          setSelectedDepartments([]);
                        }
                      }}
                    />
                    <label htmlFor="select-all-depts" className="ml-2 text-sm font-medium text-gray-700">
                      Select All
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {DEPARTMENTS.map((dept) => (
                      <div key={dept} className="flex items-center">
                        <input
                          type="checkbox"
                          id={`dept-${dept}`}
                          className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                          checked={selectedDepartments.includes(dept)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedDepartments([...selectedDepartments, dept]);
                            } else {
                              setSelectedDepartments(selectedDepartments.filter((d) => d !== dept));
                            }
                          }}
                        />
                        <label htmlFor={`dept-${dept}`} className="ml-2 text-sm text-gray-700">
                          {dept}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Selected: {selectedDepartments.length === 0 ? 'None (no access will be granted)' : selectedDepartments.join(', ')}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">
                  Credential Expiry (seconds)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={900}
                    max={604800}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={credentialExpirySeconds}
                    onChange={(e) => setCredentialExpirySeconds(Number(e.target.value))}
                  />
                  <span className="text-sm text-gray-500">
                    ({Math.floor(credentialExpirySeconds / 3600)}h {Math.floor((credentialExpirySeconds % 3600) / 60)}m)
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Min: 900 (15 min), Max: 604800 (7 days). Default: 3600 (1 hour).
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">
                  Notes (optional)
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Add any notes about this approval..."
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setApproveModalOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleApprove} 
                disabled={!dateRange?.from || !dateRange?.to || approving}
              >
                {approving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Approving...
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

        {/* Reject Modal */}
        <Dialog open={rejectModalOpen} onOpenChange={setRejectModalOpen}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>Reject Data Request</DialogTitle>
              <DialogDescription>
                Please provide a reason for rejecting this request.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <label className="text-sm font-medium text-gray-700 block mb-2">
                Rejection Reason
              </label>
              <textarea
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                rows={3}
                placeholder="Enter the reason for rejection..."
                value={rejectionNotes}
                onChange={(e) => setRejectionNotes(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleReject} disabled={rejecting}>
                {rejecting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Rejecting...
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

        {/* Credentials Modal */}
        <Dialog open={credentialsModalOpen} onOpenChange={setCredentialsModalOpen}>
          <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center">
                <Shield className="h-5 w-5 mr-2 text-green-600" />
                Temporary Access Credentials
              </DialogTitle>
              <DialogDescription>
                These credentials provide temporary access to the approved data range.
                They will expire automatically.
              </DialogDescription>
            </DialogHeader>
            {viewingRequest && (
              <div className="space-y-4 py-4">
                {viewingRequest.date_range_start && viewingRequest.date_range_end && (
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm font-medium text-blue-900">
                      <CalendarIcon className="inline h-4 w-4 mr-1" />
                      Data Access Period: {viewingRequest.date_range_start} to {viewingRequest.date_range_end}
                    </p>
                  </div>
                )}
                
                {viewingRequest.credentials_json && (() => {
                  const creds = parseCredentials(viewingRequest.credentials_json);
                  if (!creds) return <p className="text-red-600">Error parsing credentials</p>;
                  
                  return (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-medium text-gray-500 uppercase">Access Key ID</label>
                        <div className="flex items-center mt-1">
                          <code className="flex-1 p-2 bg-gray-100 rounded text-sm font-mono break-all">
                            {creds.access_key_id}
                          </code>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => copyToClipboard(creds.access_key_id, 'access_key')}
                          >
                            <Copy className={`h-4 w-4 ${copied === 'access_key' ? 'text-green-600' : ''}`} />
                          </Button>
                        </div>
                      </div>
                      
                      <div>
                        <label className="text-xs font-medium text-gray-500 uppercase">Secret Access Key</label>
                        <div className="flex items-center mt-1">
                          <code className="flex-1 p-2 bg-gray-100 rounded text-sm font-mono break-all">
                            {creds.secret_access_key}
                          </code>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => copyToClipboard(creds.secret_access_key, 'secret_key')}
                          >
                            <Copy className={`h-4 w-4 ${copied === 'secret_key' ? 'text-green-600' : ''}`} />
                          </Button>
                        </div>
                      </div>
                      
                      <div>
                        <label className="text-xs font-medium text-gray-500 uppercase">Session Token</label>
                        <div className="flex items-center mt-1">
                          <code className="flex-1 p-2 bg-gray-100 rounded text-sm font-mono break-all max-h-24 overflow-auto">
                            {creds.session_token}
                          </code>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => copyToClipboard(creds.session_token, 'session_token')}
                          >
                            <Copy className={`h-4 w-4 ${copied === 'session_token' ? 'text-green-600' : ''}`} />
                          </Button>
                        </div>
                      </div>
                      
                      <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                        <p className="text-sm text-yellow-800">
                          <strong>Expires:</strong> {new Date(creds.expiration).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  );
                })()}

                {viewingRequest.policy_json && (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                      View IAM Policy
                    </summary>
                    <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-x-auto whitespace-pre-wrap break-words">
                      {JSON.stringify(JSON.parse(viewingRequest.policy_json), null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setCredentialsModalOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
