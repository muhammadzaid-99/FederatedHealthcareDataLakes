'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard-shell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, CheckCircle2, AlertCircle, Server, Radio, Settings } from 'lucide-react';
import { api, storage } from '@/lib/api';

export default function HandshakePage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [nodeConfig, setNodeConfig] = useState<any>(null);
  const [formData, setFormData] = useState({
    client_id: '',
    client_secret: '',
    // queue_name removed — RabbitMQ no longer used
    nessie_namespace: '',
  });

  const loadNodeStatus = async () => {
    try {
      setLoading(true);
      setError('');
      const token = storage.getToken();
      if (!token) {
        router.push('/login');
        return;
      }
      const config = await api.getNodeStatus(token);
      if (config && config.handshake_done) {
        setNodeConfig(config);
        setFormData({
          client_id: config.client_id || '',
          client_secret: config.client_secret || '',
          nessie_namespace: config.nessie_namespace || '',
        });
        setStep(3);
      }
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('node not configured') || msg.includes('404')) {
        setStep(1);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setProcessing(true);
      setError('');
      setSuccess('');
      const token = storage.getToken();
      if (!token) {
        router.push('/login');
        return;
      }
      const response = await api.saveConfig(token, formData);
      setNodeConfig(response);
      setStep(2);
      setSuccess('Configuration saved successfully.');
    } catch (err: any) {
      setError(err?.message || 'Failed to save configuration');
    } finally {
      setProcessing(false);
    }
  };

  const handleHandshake = async () => {
    try {
      setProcessing(true);
      setError('');
      setSuccess('');
      const token = storage.getToken();
      if (!token) {
        router.push('/login');
        return;
      }
      await api.handshake(token);
      setSuccess('Handshake completed successfully! Your node is now connected to the central control plane.');
      setStep(3);
      await loadNodeStatus();
    } catch (err: any) {
      setError(err?.message || 'Handshake failed');
    } finally {
      setProcessing(false);
    }
  };

  useEffect(() => {
    loadNodeStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stepLabels = ['Save Config', 'Handshake', 'Complete'];
  const stepIcons = [Settings, Radio, Server];

  const renderProgressSteps = () => (
    <div className="flex items-center justify-center mb-10">
      {stepLabels.map((label, idx) => {
        const stepNum = idx + 1;
        const isCompleted = step > stepNum;
        const isActive = step === stepNum;
        const isFinal = stepNum === 3 && isCompleted;
        const Icon = stepIcons[idx];

        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold transition-all duration-300 ${
                  isFinal || (stepNum === 3 && isActive)
                    ? 'bg-emerald-600 text-white'
                    : isCompleted || isActive
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 text-slate-500'
                }`}
              >
                {isCompleted ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <Icon className="h-5 w-5" />
                )}
              </div>
              <span
                className={`mt-2 text-xs font-medium ${
                  isCompleted || isActive ? 'text-slate-800' : 'text-slate-400'
                }`}
              >
                {label}
              </span>
            </div>
            {idx < stepLabels.length - 1 && (
              <div
                className={`h-1 w-20 mx-2 rounded-full transition-all duration-300 ${
                  step > stepNum ? 'bg-blue-600' : 'bg-slate-200'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );

  const renderError = () =>
    error ? (
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
        <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
        <div>
          <p className="text-sm font-medium text-red-800">Error</p>
          <p className="text-sm text-red-600">{error}</p>
        </div>
      </div>
    ) : null;

  const renderSuccess = () =>
    success ? (
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-500" />
        <div>
          <p className="text-sm font-medium text-emerald-800">Success</p>
          <p className="text-sm text-emerald-600">{success}</p>
        </div>
      </div>
    ) : null;

  const renderStep1 = () => (
    <div className="rounded-2xl border border-slate-200 bg-white p-8">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-slate-800">Save Configuration</h2>
        <p className="mt-1 text-sm text-slate-500">
          Enter the credentials provided by the central control plane admin.
        </p>
      </div>
      <form onSubmit={handleSaveConfig} className="space-y-5">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Client ID <span className="text-red-500">*</span>
          </label>
          <Input
            value={formData.client_id}
            onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
            placeholder="Enter client ID"
            required
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Client Secret <span className="text-red-500">*</span>
          </label>
          <Input
            type="password"
            value={formData.client_secret}
            onChange={(e) => setFormData({ ...formData, client_secret: e.target.value })}
            placeholder="Enter client secret"
            required
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Nessie Namespace <span className="text-red-500">*</span>
          </label>
          <Input
            value={formData.nessie_namespace}
            onChange={(e) => setFormData({ ...formData, nessie_namespace: e.target.value })}
            placeholder="hospital_001"
            required
          />
        </div>
        <Button
          type="submit"
          disabled={processing}
          className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:from-blue-700 hover:to-cyan-700"
        >
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
    </div>
  );

  const renderStep2 = () => (
    <div className="rounded-2xl border border-slate-200 bg-white p-8">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-slate-800">Initiate Handshake</h2>
        <p className="mt-1 text-sm text-slate-500">
          Your configuration has been saved. Initiate the handshake to connect with the central control plane.
        </p>
      </div>

      <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4">
        <h3 className="mb-3 text-sm font-semibold text-blue-800">Saved Configuration</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-blue-600">Client ID</span>
            <span className="font-medium text-blue-900">{formData.client_id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-blue-600">Nessie Namespace</span>
            <span className="font-medium text-blue-900">{formData.nessie_namespace}</span>
          </div>
        </div>
      </div>

      <p className="mb-6 text-sm text-slate-600">
        The handshake process will authenticate your node with the central server
        and establish a secure connection for data exchange.
      </p>

      <Button
        onClick={handleHandshake}
        disabled={processing}
        className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:from-blue-700 hover:to-cyan-700"
      >
        {processing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Performing Handshake...
          </>
        ) : (
          <>
            <Radio className="mr-2 h-4 w-4" />
            Initiate Handshake
          </>
        )}
      </Button>
    </div>
  );

  const renderStep3 = () => (
    <div className="rounded-2xl border border-emerald-200 bg-white p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Node Connected</h2>
          <p className="mt-1 text-sm text-slate-500">
            Your hospital node is successfully connected to the central control plane.
          </p>
        </div>
        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Connected</Badge>
      </div>

      <div className="mb-6 rounded-xl bg-emerald-50 p-4">
        <div className="divide-y divide-emerald-200">
          <div className="flex justify-between py-3 first:pt-0">
            <span className="text-sm text-emerald-600">Client ID</span>
            <span className="text-sm font-medium text-emerald-900">{nodeConfig?.client_id || formData.client_id}</span>
          </div>
          <div className="flex justify-between py-3">
            <span className="text-sm text-emerald-600">Namespace</span>
            <span className="text-sm font-medium text-emerald-900">{nodeConfig?.nessie_namespace || formData.nessie_namespace}</span>
          </div>
          <div className="flex justify-between py-3 last:pb-0">
            <span className="text-sm text-emerald-600">Status</span>
            <span className="text-sm font-semibold text-emerald-700">Connected</span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              setStep(1);
              setSuccess('');
              setError('');
            }}
          >
            <Settings className="mr-2 h-4 w-4" />
            Edit Configuration
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              setStep(2);
              setSuccess('');
              setError('');
            }}
          >
            <Radio className="mr-2 h-4 w-4" />
            Re-handshake
          </Button>
        </div>
        <div className="flex gap-3">
          <Button
            className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:from-blue-700 hover:to-cyan-700"
            onClick={() => router.push('/dashboard')}
          >
            Go to Dashboard
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => router.push('/requests')}
          >
            View Requests
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <DashboardShell
      title="Node Setup"
      description="Configure your hospital node with credentials from the central control plane"
    >
      <div className="mx-auto max-w-2xl py-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
            <p className="mt-4 text-sm text-slate-500">Loading node status...</p>
          </div>
        ) : (
          <>
            {renderProgressSteps()}
            {renderError()}
            {renderSuccess()}
            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
          </>
        )}
      </div>
    </DashboardShell>
  );
}
