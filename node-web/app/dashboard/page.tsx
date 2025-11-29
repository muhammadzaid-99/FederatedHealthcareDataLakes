'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, storage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Database, FileText, LogOut, MessageSquare, RefreshCw, Server, Settings, Workflow } from 'lucide-react';
import { formatDateTimeString, formatTimeString } from '@/lib/utils';

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hospitalInfo, setHospitalInfo] = useState<any>(null);
  const [error, setError] = useState('');
  const [schedulerStatus, setSchedulerStatus] = useState<any>(null);

  const loadNodeStatus = async () => {
    const token = storage.getToken();
    if (!token) {
      router.push('/login');
      return;
    }

    try {
      setRefreshing(true);
      const response = await api.getNodeStatus(token);
      setHospitalInfo(response.config);
      storage.setUserInfo(response.config);
      setError('');
    } catch (err: any) {
      // If node is not configured yet, that's OK - just show empty state
      if (err.message.includes('node not configured yet') || err.message.includes('404')) {
        setHospitalInfo(null);
        setError('');
      } else if (err.message.includes('401') || err.message.includes('unauthorized')) {
        storage.clear();
        router.push('/login');
      } else {
        setError(err.message || 'Failed to load node status');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadSchedulerStatus = async () => {
    try {
      const response = await api.get("/etl/scheduler/status");
      setSchedulerStatus(response);
    } catch (error) {
      // Scheduler status is optional, don't show error
      console.log("Scheduler status not available");
    }
  };

  useEffect(() => {
    loadNodeStatus();
    loadSchedulerStatus();

    // Refresh scheduler status every 10 seconds
    const interval = setInterval(loadSchedulerStatus, 10000);
    return () => clearInterval(interval);
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
                  Hospital Node Portal
                </h1>
                <p className="text-sm text-gray-600">
                  {hospitalInfo?.handshake_done ? 'Connected' : 'Not Connected'}
                </p>
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
        <div className="grid md:grid-cols-4 gap-6 mb-8">
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

          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/queue-viewer')}>
            <CardHeader>
              <CardTitle className="flex items-center">
                <MessageSquare className="h-5 w-5 mr-2 text-orange-600" />
                Queue Viewer
              </CardTitle>
              <CardDescription>
                Monitor RabbitMQ messages in real-time
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/etl/config')}>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Workflow className="h-5 w-5 mr-2 text-purple-600" />
                ETL Config
              </CardTitle>
              <CardDescription>
                Configure data extraction and transformation
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/etl/jobs')}>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Database className="h-5 w-5 mr-2 text-cyan-600" />
                ETL Jobs
              </CardTitle>
              <CardDescription>
                Monitor ETL job executions
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* Second row */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/handshake')}>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Settings className="h-5 w-5 mr-2 text-green-600" />
                Configuration
              </CardTitle>
              <CardDescription>
                {hospitalInfo?.handshake_done ? 'Update node settings' : 'Configure node'}
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Server className="h-5 w-5 mr-2 text-indigo-600" />
                Node Status
              </CardTitle>
              <CardDescription>
                {hospitalInfo?.handshake_done ? (
                  <Badge variant="default">Active</Badge>
                ) : (
                  <Badge variant="secondary">Not Configured</Badge>
                )}
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Activity className="h-5 w-5 mr-2 text-green-600" />
                ETL Scheduler
              </CardTitle>
              <CardDescription>
                {schedulerStatus ? (
                  <div className="space-y-2 mt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Status:</span>
                      <Badge variant={schedulerStatus.is_running ? "default" : "secondary"}>
                        {schedulerStatus.is_running ? "Running" : "Stopped"}
                      </Badge>
                    </div>
                    {schedulerStatus.is_running && schedulerStatus.next_run && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Next Run:</span>
                        <span className="text-xs">{formatTimeString(schedulerStatus.next_run)}</span>
                      </div>
                    )}
                    {schedulerStatus.is_running && schedulerStatus.next_run_in_seconds > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm">In:</span>
                        <span className="text-xs font-mono">
                          {Math.floor(schedulerStatus.next_run_in_seconds / 60)}m {schedulerStatus.next_run_in_seconds % 60}s
                        </span>
                      </div>
                    )}
                    {!schedulerStatus.is_running && (
                      <div className="text-xs text-muted-foreground">
                        Start from ETL Config page
                      </div>
                    )}
                  </div>
                ) : (
                  <Badge variant="outline">Not Configured</Badge>
                )}
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* Node Configuration Status */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Node Configuration</CardTitle>
            <CardDescription>Current node settings and status</CardDescription>
          </CardHeader>
          <CardContent>
            {hospitalInfo?.handshake_done ? (
              <div className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Connection Details</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-sm text-gray-600">Client ID:</span>
                        <span className="text-sm font-mono">{hospitalInfo?.client_id}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-sm text-gray-600">Queue Name:</span>
                        <span className="text-sm font-mono">{hospitalInfo?.queue_name || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-sm text-gray-600">Nessie Namespace:</span>
                        <span className="text-sm font-mono">{hospitalInfo?.nessie_namespace || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-sm text-gray-600">Handshake Status:</span>
                        <Badge variant="default">Connected</Badge>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Timestamps</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-sm text-gray-600">Configured At:</span>
                        <span className="text-sm">
                          {hospitalInfo?.configured_at ? formatDateTimeString(hospitalInfo.configured_at) : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4">
                  <Button onClick={() => router.push('/handshake')} variant="outline" className="flex-1">
                    <Settings className="mr-2 h-4 w-4" />
                    Reconfigure / Re-handshake
                  </Button>
                  <Button onClick={loadNodeStatus} variant="outline">
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <Server className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Node Not Configured</h3>
                <p className="text-gray-600 mb-6">
                  You need to configure your node with credentials from the central portal before you can start using it.
                </p>
                <Button onClick={() => router.push('/handshake')}>
                  <Settings className="mr-2 h-4 w-4" />
                  Configure Node
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
