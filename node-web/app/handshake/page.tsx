'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, storage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, CheckCircle2, Loader2, Radio, Server, AlertCircle, Settings } from 'lucide-react';

export default function HandshakePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1); // 1: Save Config, 2: Handshake
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [nodeConfig, setNodeConfig] = useState<any>(null);
  const [formData, setFormData] = useState({
    client_id: '',
    client_secret: '',
    queue_name: '',
    nessie_namespace: '',
  });

  useEffect(() => {
    const token = storage.getToken();
    if (!token) {
      router.push('/login');
      return;
    }
    loadNodeStatus();
  }, [router]);

  const loadNodeStatus = async () => {
    const token = storage.getToken();
    if (!token) return;

    try {
      const response = await api.getNodeStatus(token);
      setNodeConfig(response.config);
      
      // If config exists, populate form but allow editing
      if (response.config && response.config.client_id) {
        setFormData({
          client_id: response.config.client_id,
          client_secret: '', // Always require re-entering secret
          queue_name: response.config.queue_name || '',
          nessie_namespace: response.config.nessie_namespace || '',
        });
        
        // Show current step based on handshake status, but allow going back to step 1
        if (response.config.handshake_done) {
          setStep(3); // Already completed, but user can still edit
        } else {
          setStep(2); // Ready for handshake
        }
      }
    } catch (err: any) {
      // If node not configured yet, that's fine - start at step 1
      if (!err.message.includes('node not configured yet') && !err.message.includes('404')) {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setProcessing(true);
    setError('');
    setSuccess('');

    const token = storage.getToken();
    if (!token) {
      router.push('/login');
      return;
    }

    try {
      await api.saveConfig(token, {
        client_id: formData.client_id,
        client_secret: formData.client_secret,
        queue_name: formData.queue_name,
        nessie_namespace: formData.nessie_namespace,
      });

      setSuccess('Configuration saved successfully!');
      setStep(2);
      await loadNodeStatus();
    } catch (err: any) {
      setError(err.message || 'Failed to save configuration');
    } finally {
      setProcessing(false);
    }
  };

  const handleHandshake = async () => {
    setProcessing(true);
    setError('');
    setSuccess('');

    const token = storage.getToken();
    if (!token) {
      router.push('/login');
      return;
    }

    try {
      const response = await api.handshake(token);
      setSuccess('Handshake completed successfully! RabbitMQ listener started.');
      setStep(3);
      await loadNodeStatus();
    } catch (err: any) {
      setError(err.message || 'Handshake failed');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading node configuration...</p>
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

        <div className="max-w-2xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Node Configuration</h1>
            <p className="text-gray-600">
              Configure your hospital node with credentials from the central control plane
            </p>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center justify-center mb-8">
            <div className="flex items-center">
              <div className={`flex items-center justify-center w-10 h-10 rounded-full ${step >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'}`}>
                {step > 1 ? <CheckCircle2 className="h-6 w-6" /> : '1'}
              </div>
              <div className={`w-24 h-1 ${step >= 2 ? 'bg-blue-600' : 'bg-gray-300'}`}></div>
              <div className={`flex items-center justify-center w-10 h-10 rounded-full ${step >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'}`}>
                {step > 2 ? <CheckCircle2 className="h-6 w-6" /> : '2'}
              </div>
              <div className={`w-24 h-1 ${step >= 3 ? 'bg-blue-600' : 'bg-gray-300'}`}></div>
              <div className={`flex items-center justify-center w-10 h-10 rounded-full ${step >= 3 ? 'bg-green-600 text-white' : 'bg-gray-300 text-gray-600'}`}>
                {step >= 3 ? <CheckCircle2 className="h-6 w-6" /> : '3'}
              </div>
            </div>
          </div>

          {/* Error/Success Messages */}
          {error && (
            <Card className="mb-6 border-red-200 bg-red-50">
              <CardContent className="pt-6">
                <div className="flex items-start">
                  <AlertCircle className="h-5 w-5 text-red-600 mr-3 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {success && (
            <Card className="mb-6 border-green-200 bg-green-50">
              <CardContent className="pt-6">
                <div className="flex items-start">
                  <CheckCircle2 className="h-5 w-5 text-green-600 mr-3 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-green-700">{success}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 1: Save Configuration */}
          {step === 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Server className="h-5 w-5 mr-2 text-blue-600" />
                  Step 1: Save Node Configuration
                </CardTitle>
                <CardDescription>
                  Enter the credentials provided by the central control plane
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveConfig} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Client ID
                    </label>
                    <Input
                      type="text"
                      placeholder="Enter client ID"
                      value={formData.client_id}
                      onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Client Secret
                    </label>
                    <Input
                      type="password"
                      placeholder="Enter client secret"
                      value={formData.client_secret}
                      onChange={(e) => setFormData({ ...formData, client_secret: e.target.value })}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Queue Name
                    </label>
                    <Input
                      type="text"
                      placeholder="e.g., hospital_queue_001"
                      value={formData.queue_name}
                      onChange={(e) => setFormData({ ...formData, queue_name: e.target.value })}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nessie Namespace
                    </label>
                    <Input
                      type="text"
                      placeholder="e.g., hospital_001"
                      value={formData.nessie_namespace}
                      onChange={(e) => setFormData({ ...formData, nessie_namespace: e.target.value })}
                      required
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={processing}>
                    {processing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Configuration'
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Initiate Handshake */}
          {step === 2 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Radio className="h-5 w-5 mr-2 text-blue-600" />
                  Step 2: Initiate Handshake
                </CardTitle>
                <CardDescription>
                  Connect with the central control plane and start RabbitMQ listener
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-semibold text-sm text-blue-900 mb-2">Configuration Saved</h4>
                  <div className="space-y-1 text-sm text-blue-700">
                    <p><strong>Client ID:</strong> {nodeConfig?.client_id || formData.client_id}</p>
                    <p><strong>Queue:</strong> {nodeConfig?.queue_name || formData.queue_name}</p>
                    <p><strong>Namespace:</strong> {nodeConfig?.nessie_namespace || formData.nessie_namespace}</p>
                  </div>
                </div>

                <p className="text-sm text-gray-600">
                  Click below to authenticate with the central backend and establish the connection. 
                  This will also start the RabbitMQ listener to receive messages.
                </p>

                <Button onClick={handleHandshake} className="w-full" disabled={processing}>
                  {processing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Radio className="mr-2 h-4 w-4" />
                      Initiate Handshake
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Completed */}
          {step === 3 && (
            <Card className="border-green-200">
              <CardHeader>
                <CardTitle className="flex items-center text-green-700">
                  <CheckCircle2 className="h-5 w-5 mr-2" />
                  Configuration Complete
                </CardTitle>
                <CardDescription>
                  Your node is connected and listening for messages
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between py-2 border-b border-green-200">
                      <span className="text-green-900 font-medium">Client ID:</span>
                      <span className="text-green-700 font-mono">{nodeConfig?.client_id}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-green-200">
                      <span className="text-green-900 font-medium">Queue:</span>
                      <span className="text-green-700 font-mono">{nodeConfig?.queue_name}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-green-200">
                      <span className="text-green-900 font-medium">Namespace:</span>
                      <span className="text-green-700 font-mono">{nodeConfig?.nessie_namespace}</span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-green-900 font-medium">Status:</span>
                      <Badge variant="default" className="bg-green-600">Connected</Badge>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button onClick={() => setStep(1)} variant="outline" className="flex-1">
                    <Settings className="mr-2 h-4 w-4" />
                    Edit Configuration
                  </Button>
                  <Button onClick={handleHandshake} variant="outline" className="flex-1" disabled={processing}>
                    {processing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Reconnecting...
                      </>
                    ) : (
                      <>
                        <Radio className="mr-2 h-4 w-4" />
                        Re-handshake
                      </>
                    )}
                  </Button>
                </div>

                <div className="flex gap-3">
                  <Button onClick={() => router.push('/dashboard')} className="flex-1">
                    Go to Dashboard
                  </Button>
                  <Button onClick={() => router.push('/queue-viewer')} variant="outline" className="flex-1">
                    View Queue
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
