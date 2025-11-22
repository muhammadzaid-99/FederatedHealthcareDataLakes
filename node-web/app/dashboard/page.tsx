'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, storage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Database, FileText, LogOut, RefreshCw, Server, Settings } from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hospitalInfo, setHospitalInfo] = useState<any>(null);
  const [error, setError] = useState('');

  const loadNodeStatus = async () => {
    const token = storage.getAccessToken();
    if (!token) {
      router.push('/');
      return;
    }

    try {
      setRefreshing(true);
      const response = await api.getNodeStatus(token);
      setHospitalInfo(response.hospital);
      storage.setHospitalInfo(response.hospital);
    } catch (err: any) {
      setError(err.message || 'Failed to load node status');
      if (err.message.includes('401') || err.message.includes('unauthorized')) {
        storage.clear();
        router.push('/');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadNodeStatus();
  }, []);

  const handleLogout = () => {
    storage.clear();
    router.push('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading node status...</p>
        </div>
      </div>
    );
  }

  if (error && !hospitalInfo) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Error</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push('/')} className="w-full">
              Back to Home
            </Button>
          </CardContent>
        </Card>
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
              <Activity className="h-8 w-8 text-blue-600 mr-3" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {hospitalInfo?.name || 'Hospital Node'}
                </h1>
                <p className="text-sm text-gray-600">{hospitalInfo?.email}</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Button
                variant="outline"
                size="sm"
                onClick={loadNodeStatus}
                disabled={refreshing}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Quick Actions */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/requests')}>
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="h-5 w-5 mr-2 text-blue-600" />
                Data Requests
              </CardTitle>
              <CardDescription>
                View and respond to incoming data access requests
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Database className="h-5 w-5 mr-2 text-green-600" />
                Storage
              </CardTitle>
              <CardDescription>
                MinIO: {hospitalInfo?.minio_endpoint || 'Not configured'}
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Server className="h-5 w-5 mr-2 text-purple-600" />
                Catalog
              </CardTitle>
              <CardDescription>
                Nessie: {hospitalInfo?.nessie_namespace || 'Not configured'}
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* Node Status */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Node Status</CardTitle>
            <CardDescription>Current configuration and capabilities</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">General Information</h3>
                <div className="space-y-2">
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-sm text-gray-600">Node ID:</span>
                    <span className="text-sm font-mono">{hospitalInfo?.id?.slice(0, 8)}...</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-sm text-gray-600">Status:</span>
                    <Badge variant={hospitalInfo?.status === 'ACTIVE' ? 'default' : 'secondary'}>
                      {hospitalInfo?.status}
                    </Badge>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-sm text-gray-600">Client ID:</span>
                    <span className="text-sm font-mono">{hospitalInfo?.client_id?.slice(0, 12)}...</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-sm text-gray-600">Queue Name:</span>
                    <span className="text-sm font-mono">{hospitalInfo?.queue_name}</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Capabilities</h3>
                {hospitalInfo?.capabilities ? (
                  <div className="space-y-2">
                    {Object.entries(hospitalInfo.capabilities).map(([key, value]: [string, any]) => (
                      <div key={key} className="flex justify-between py-2 border-b">
                        <span className="text-sm text-gray-600 capitalize">
                          {key.replace(/_/g, ' ')}:
                        </span>
                        <span className="text-sm font-medium">
                          {Array.isArray(value) ? value.join(', ') : String(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No capabilities configured</p>
                )}
              </div>
            </div>

            {/* Timestamps */}
            <div className="mt-6 pt-6 border-t">
              <div className="grid md:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Created:</span>
                  <p className="font-medium">
                    {hospitalInfo?.created_at ? new Date(hospitalInfo.created_at).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
                <div>
                  <span className="text-gray-600">Handshake:</span>
                  <p className="font-medium">
                    {hospitalInfo?.handshake_at ? new Date(hospitalInfo.handshake_at).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
                <div>
                  <span className="text-gray-600">Last Updated:</span>
                  <p className="font-medium">
                    {hospitalInfo?.updated_at ? new Date(hospitalInfo.updated_at).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
