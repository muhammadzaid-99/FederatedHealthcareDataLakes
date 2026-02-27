'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, storage } from '@/lib/api';
import { DashboardShell } from '@/components/dashboard-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Activity,
  Database,
  FileText,
  Plug,
  RefreshCw,
  Server,
  Settings,
  Workflow,
  ChevronRight,
  CircleDot,
} from 'lucide-react';
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
    if (!token) { router.push('/login'); return; }

    try {
      setRefreshing(true);
      const response = await api.getNodeStatus(token);
      setHospitalInfo(response.config);
      storage.setUserInfo(response.config);
      setError('');
    } catch (err: any) {
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
      const response = await api.get('/etl/scheduler/status');
      setSchedulerStatus(response);
    } catch {
      console.log('Scheduler status not available');
    }
  };

  useEffect(() => {
    loadNodeStatus();
    loadSchedulerStatus();
    const interval = setInterval(loadSchedulerStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <DashboardShell title="Dashboard" description="Loading node status…">
        <div className="flex items-center justify-center py-32">
          <RefreshCw className="h-8 w-8 text-blue-600 animate-spin" />
        </div>
      </DashboardShell>
    );
  }

  if (error && !hospitalInfo) {
    return (
      <DashboardShell title="Dashboard" description="Error">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center max-w-md mx-auto mt-20">
          <p className="text-sm text-red-700 mb-4">{error}</p>
          <Button onClick={() => router.push('/login')} className="bg-blue-600 hover:bg-blue-700">
            Back to Login
          </Button>
        </div>
      </DashboardShell>
    );
  }

  const quickActions = [
    { href: '/requests', icon: FileText, label: 'Data Requests', desc: 'View and respond to incoming data access requests', color: 'blue' },
    { href: '/etl/config', icon: Settings, label: 'ETL Config', desc: 'Configure data extraction & transformation', color: 'violet' },
    { href: '/etl/jobs', icon: Workflow, label: 'ETL Jobs', desc: 'Monitor ETL job executions', color: 'cyan' },
  ];

  const colorMap: Record<string, { bg: string; text: string; shadow: string }> = {
    blue:   { bg: 'bg-blue-100', text: 'text-blue-600', shadow: 'shadow-blue-500/5' },
    amber:  { bg: 'bg-amber-100', text: 'text-amber-600', shadow: 'shadow-amber-500/5' },
    violet: { bg: 'bg-violet-100', text: 'text-violet-600', shadow: 'shadow-violet-500/5' },
    cyan:   { bg: 'bg-cyan-100', text: 'text-cyan-600', shadow: 'shadow-cyan-500/5' },
  };

  return (
    <DashboardShell
      title="Dashboard"
      description={hospitalInfo?.handshake_done ? 'Connected to central network' : 'Node not connected'}
      actions={
        <Button variant="outline" size="sm" onClick={loadNodeStatus} disabled={refreshing} className="h-9">
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      }
    >
      {/* Quick Action Cards */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
        {quickActions.map((action) => {
          const c = colorMap[action.color];
          return (
            <button
              key={action.href}
              onClick={() => router.push(action.href)}
              className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left transition-all hover:shadow-lg hover:-translate-y-0.5"
            >
              <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${c.bg} mb-4`}>
                <action.icon className={`h-5 w-5 ${c.text}`} />
              </div>
              <h3 className="text-sm font-semibold text-slate-900 mb-1 flex items-center gap-1">
                {action.label}
                <ChevronRight className="h-3.5 w-3.5 text-slate-400 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">{action.desc}</p>
            </button>
          );
        })}
      </div>

      {/* Status Row */}
      <div className="grid sm:grid-cols-3 gap-5 mb-8">
        {/* Node Status */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100">
              <Server className="h-4 w-4 text-indigo-600" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">Node Status</h3>
          </div>
          {hospitalInfo?.handshake_done ? (
            <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-50">
              <CircleDot className="h-3 w-3 mr-1 text-emerald-500" />
              Active
            </Badge>
          ) : (
            <Badge variant="secondary" className="border border-slate-200">Not Configured</Badge>
          )}
        </div>

        {/* Configuration */}
        <button
          onClick={() => router.push('/handshake')}
          className="rounded-2xl border border-slate-200 bg-white p-5 text-left hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100">
              <Plug className="h-4 w-4 text-emerald-600" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">Configuration</h3>
          </div>
          <p className="text-xs text-slate-500">
            {hospitalInfo?.handshake_done ? 'Update node settings' : 'Configure node'}
          </p>
        </button>

        {/* ETL Scheduler */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100">
              <Activity className="h-4 w-4 text-blue-600" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">ETL Scheduler</h3>
          </div>
          {schedulerStatus ? (
            <div className="space-y-2">
              <Badge className={schedulerStatus.is_running
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-50'
                : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-100'
              }>
                {schedulerStatus.is_running ? 'Running' : 'Stopped'}
              </Badge>
              {schedulerStatus.is_running && schedulerStatus.next_run && (
                <p className="text-xs text-slate-500">
                  Next run: <span className="font-mono">{formatTimeString(schedulerStatus.next_run)}</span>
                </p>
              )}
              {schedulerStatus.is_running && schedulerStatus.next_run_in_seconds > 0 && (
                <p className="text-xs text-slate-500">
                  In: <span className="font-mono">{Math.floor(schedulerStatus.next_run_in_seconds / 60)}m {schedulerStatus.next_run_in_seconds % 60}s</span>
                </p>
              )}
              {!schedulerStatus.is_running && (
                <p className="text-xs text-slate-400">Start from ETL Config page</p>
              )}
            </div>
          ) : (
            <Badge variant="outline" className="text-slate-500">Not Configured</Badge>
          )}
        </div>
      </div>

      {/* Node Configuration Details */}
      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Node Configuration</h2>
            <p className="text-sm text-slate-500">Current node settings and status</p>
          </div>
          {hospitalInfo?.handshake_done && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => router.push('/handshake')}>
                <Settings className="h-3.5 w-3.5 mr-1.5" />
                Reconfigure
              </Button>
              <Button variant="ghost" size="sm" onClick={loadNodeStatus}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        <div className="p-6">
          {hospitalInfo?.handshake_done ? (
            <div className="grid md:grid-cols-2 gap-8">
              {/* Connection Details */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">Connection Details</h3>
                <div className="space-y-3">
                  {[
                    { label: 'Client ID', value: hospitalInfo?.client_id },
                    { label: 'Nessie Namespace', value: hospitalInfo?.nessie_namespace || 'N/A' },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
                      <span className="text-sm text-slate-500">{item.label}</span>
                      <span className="text-sm font-mono text-slate-900 bg-slate-50 px-2 py-0.5 rounded">{item.value}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between py-2.5">
                    <span className="text-sm text-slate-500">Handshake</span>
                    <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-50">Connected</Badge>
                  </div>
                </div>
              </div>

              {/* Timestamps */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">Timestamps</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2.5 border-b border-slate-100">
                    <span className="text-sm text-slate-500">Configured At</span>
                    <span className="text-sm text-slate-700">
                      {hospitalInfo?.configured_at ? formatDateTimeString(hospitalInfo.configured_at) : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 mb-4">
                <Server className="h-7 w-7 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Node Not Configured</h3>
              <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto">
                Configure your node with credentials from the central portal to start using it.
              </p>
              <Button onClick={() => router.push('/handshake')} className="bg-blue-600 hover:bg-blue-700">
                <Plug className="mr-2 h-4 w-4" />
                Configure Node
              </Button>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
