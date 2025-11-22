'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, storage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
  ArrowLeft, 
  CheckCircle, 
  FileText, 
  Loader2, 
  RefreshCw, 
  XCircle 
} from 'lucide-react';

export default function RequestsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<any[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [showResponseForm, setShowResponseForm] = useState(false);
  const [responseForm, setResponseForm] = useState({
    status: 'APPROVED' as 'APPROVED' | 'REJECTED',
    presigned_url: '',
    notes: '',
    valid_hours: '72',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const loadRequests = async () => {
    const token = storage.getAccessToken();
    if (!token) {
      router.push('/');
      return;
    }

    try {
      setLoading(true);
      const response = await api.getRequests(token);
      setRequests(response.requests || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load requests');
      if (err.message.includes('401') || err.message.includes('unauthorized')) {
        storage.clear();
        router.push('/');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const handleRespondToRequest = (request: any) => {
    setSelectedRequest(request);
    setShowResponseForm(true);
    setResponseForm({
      status: 'APPROVED',
      presigned_url: '',
      notes: '',
      valid_hours: '72',
    });
  };

  const handleSubmitResponse = async () => {
    const token = storage.getAccessToken();
    if (!token || !selectedRequest) return;

    try {
      setSubmitting(true);
      await api.submitResponse(token, selectedRequest.id, {
        status: responseForm.status,
        presigned_url: responseForm.status === 'APPROVED' ? responseForm.presigned_url : undefined,
        notes: responseForm.notes,
        valid_hours: responseForm.status === 'APPROVED' ? parseInt(responseForm.valid_hours) : undefined,
      });

      setShowResponseForm(false);
      setSelectedRequest(null);
      loadRequests(); // Reload requests
    } catch (err: any) {
      setError(err.message || 'Failed to submit response');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Badge variant="secondary">Pending</Badge>;
      case 'APPROVED':
        return <Badge className="bg-green-500">Approved</Badge>;
      case 'REJECTED':
        return <Badge variant="destructive">Rejected</Badge>;
      case 'PARTIAL_APPROVED':
        return <Badge className="bg-yellow-500">Partial</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading requests...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/dashboard')}
                className="mr-4"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <FileText className="h-6 w-6 text-blue-600 mr-3" />
              <h1 className="text-2xl font-bold text-gray-900">Data Access Requests</h1>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadRequests}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {error && !showResponseForm && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-4 mb-6">
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Response Form Modal */}
        {showResponseForm && selectedRequest && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Respond to Request</CardTitle>
              <CardDescription>
                Request from {selectedRequest.requestor_email}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <h3 className="font-semibold mb-2">Request Details:</h3>
                  <p className="text-sm text-gray-700 mb-2">
                    <strong>Purpose:</strong> {selectedRequest.purpose}
                  </p>
                  {selectedRequest.data_query && (
                    <p className="text-sm text-gray-700">
                      <strong>Query:</strong> {JSON.stringify(selectedRequest.data_query)}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Response Status *</label>
                  <div className="flex space-x-4">
                    <Button
                      type="button"
                      variant={responseForm.status === 'APPROVED' ? 'default' : 'outline'}
                      onClick={() => setResponseForm({ ...responseForm, status: 'APPROVED' })}
                      className="flex-1"
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Approve
                    </Button>
                    <Button
                      type="button"
                      variant={responseForm.status === 'REJECTED' ? 'destructive' : 'outline'}
                      onClick={() => setResponseForm({ ...responseForm, status: 'REJECTED' })}
                      className="flex-1"
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Reject
                    </Button>
                  </div>
                </div>

                {responseForm.status === 'APPROVED' && (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Pre-signed URL *</label>
                      <Input
                        type="text"
                        value={responseForm.presigned_url}
                        onChange={(e) => setResponseForm({ ...responseForm, presigned_url: e.target.value })}
                        placeholder="https://minio.hospital.com/data/dataset.parquet?token=..."
                      />
                      <p className="text-xs text-gray-500">
                        Provide a pre-signed URL to your MinIO bucket with the requested data
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">URL Valid Hours</label>
                      <Input
                        type="number"
                        value={responseForm.valid_hours}
                        onChange={(e) => setResponseForm({ ...responseForm, valid_hours: e.target.value })}
                        placeholder="72"
                      />
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium">Notes (Optional)</label>
                  <Textarea
                    value={responseForm.notes}
                    onChange={(e) => setResponseForm({ ...responseForm, notes: e.target.value })}
                    placeholder="Add any additional notes or comments..."
                    rows={3}
                  />
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3">
                    <p className="text-sm">{error}</p>
                  </div>
                )}

                <div className="flex space-x-3">
                  <Button
                    onClick={handleSubmitResponse}
                    disabled={submitting}
                    className="flex-1"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      'Submit Response'
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowResponseForm(false);
                      setSelectedRequest(null);
                      setError('');
                    }}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Requests List */}
        <div className="space-y-4">
          {requests.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No data access requests yet</p>
              </CardContent>
            </Card>
          ) : (
            requests.map((request) => (
              <Card key={request.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">
                        Request from {request.requestor_email}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {request.purpose}
                      </CardDescription>
                    </div>
                    <div className="flex items-center space-x-2">
                      {getStatusBadge(request.status)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {request.data_query && (
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-sm font-medium text-gray-700 mb-1">Data Query:</p>
                        <pre className="text-xs text-gray-600 overflow-x-auto">
                          {JSON.stringify(request.data_query, null, 2)}
                        </pre>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-sm">
                      <div className="text-gray-600">
                        <span className="font-medium">Requested:</span>{' '}
                        {new Date(request.created_at).toLocaleDateString()}
                      </div>
                      <div className="text-gray-600">
                        <span className="font-medium">Expires:</span>{' '}
                        {new Date(request.expires_at).toLocaleDateString()}
                      </div>
                    </div>

                    {request.status === 'PENDING' && (
                      <Button
                        onClick={() => handleRespondToRequest(request)}
                        className="w-full mt-3"
                      >
                        Respond to Request
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
