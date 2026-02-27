'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, storage } from '@/lib/api';
import { DashboardShell } from '@/components/dashboard-shell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Inbox, MessageSquare, RefreshCw } from 'lucide-react';

export default function QueueViewerPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [error, setError] = useState('');

  const loadMessages = async () => {
    const token = storage.getToken();
    if (!token) { router.push('/login'); return; }

    try {
      setRefreshing(true);
      setError('');
      const response = await api.getMessages(token);
      setMessages(response.messages || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load messages');
      if (err.message.includes('401') || err.message.includes('unauthorized')) {
        storage.clear();
        router.push('/login');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadMessages(); }, []);

  const statusColor = (status: string) => {
    if (status === 'processed') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    return 'bg-slate-100 text-slate-600 border-slate-200';
  };

  return (
    <DashboardShell
      title="Message History"
      description="Historical messages (RabbitMQ has been removed — this shows legacy data only)"
      actions={
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-1.5 animate-pulse" />
            Connected
          </Badge>
          <span className="text-sm text-slate-500">
            {messages.length} message{messages.length !== 1 ? 's' : ''}
          </span>
          <Button variant="outline" size="sm" onClick={loadMessages} disabled={refreshing} className="h-9">
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      }
    >
      {error && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-900">Error</p>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <RefreshCw className="h-8 w-8 text-blue-600 animate-spin" />
        </div>
      ) : messages.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 mb-4">
            <Inbox className="h-7 w-7 text-slate-400" />
          </div>
          <h3 className="text-base font-semibold text-slate-900 mb-1">No messages yet</h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            Messages will appear here once your node has completed the handshake and the central backend starts forwarding requests.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {messages.map((message: any) => (
            <div key={message.id} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
              {/* Message Header */}
              <div className="flex items-start justify-between p-5 border-b border-slate-100">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100">
                    <MessageSquare className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">{message.message_type || 'Message'}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {new Date(message.created_at).toLocaleString('en-PK')}
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className={statusColor(message.status)}>
                  {message.status}
                </Badge>
              </div>

              {/* Message Body */}
              <div className="p-5 space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Queue</p>
                  <p className="text-sm font-mono text-slate-700 bg-slate-50 px-3 py-1.5 rounded-lg inline-block">{message.queue_name}</p>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Payload</p>
                  <div className="bg-slate-900 rounded-xl p-4 max-h-80 overflow-auto scrollbar-thin">
                    <pre className="text-xs text-emerald-400 whitespace-pre-wrap font-mono">
                      {typeof message.payload === 'string'
                        ? message.payload
                        : JSON.stringify(message.payload, null, 2)}
                    </pre>
                  </div>
                </div>

                {message.error_message && (
                  <div className="rounded-xl bg-red-50 border border-red-200 p-4">
                    <p className="text-xs font-semibold text-red-900 mb-1">Error</p>
                    <p className="text-sm text-red-700">{message.error_message}</p>
                  </div>
                )}

                {message.processed_at && (
                  <p className="text-xs text-slate-400">
                    Processed at: {new Date(message.processed_at).toLocaleString('en-PK')}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
