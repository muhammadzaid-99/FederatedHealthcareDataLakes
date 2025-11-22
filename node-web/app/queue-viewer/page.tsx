'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, storage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Loader2, MessageSquare, RefreshCw, AlertCircle } from 'lucide-react';

export default function QueueViewerPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [error, setError] = useState('');

  const loadMessages = async () => {
    const token = storage.getToken();
    if (!token) {
      router.push('/login');
      return;
    }

    try {
      setRefreshing(true);
      setError('');
      const response = await api.getMessages(token);
      console.log(response)
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

  useEffect(() => {
    loadMessages();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading messages...</p>
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

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">RabbitMQ Messages</h1>
          <p className="text-gray-600">View messages received from the central backend</p>
        </div>

        {error && (
          <Card className="mb-6 border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-start">
                <AlertCircle className="h-5 w-5 text-red-600 mr-3 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-900">Error</p>
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
              Connected
            </Badge>
            <span className="text-sm text-gray-600">
              {messages.length} message{messages.length !== 1 ? 's' : ''}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadMessages}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Messages List */}
        {messages.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <MessageSquare className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No messages yet</h3>
              <p className="text-gray-600">
                Waiting for incoming messages from RabbitMQ...
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Messages will appear here after handshake is complete
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {messages.map((message: any) => (
              <Card key={message.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{message.message_type || 'Message'}</CardTitle>
                      <CardDescription>
                        {new Date(message.created_at).toLocaleString("en-PK")}
                      </CardDescription>
                    </div>
                    <Badge variant={message.status === 'processed' ? 'default' : 'secondary'}>
                      {message.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Queue:</p>
                    <p className="text-sm font-mono text-gray-900">{message.queue_name}</p>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Payload:</p>
                    <div className="bg-gray-50 rounded-lg p-3 max-h-96 overflow-auto">
                      <pre className="text-xs text-gray-800 whitespace-pre-wrap">
                        {typeof message.payload === 'string' 
                          ? message.payload 
                          : JSON.stringify(message.payload, null, 2)}
                      </pre>
                    </div>
                  </div>

                  {message.error_message && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-sm font-medium text-red-900">Error:</p>
                      <p className="text-sm text-red-700">{message.error_message}</p>
                    </div>
                  )}

                  {message.processed_at && (
                    <div className="text-xs text-gray-500">
                      Processed at: {new Date(message.processed_at).toLocaleString("en-PK")}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
