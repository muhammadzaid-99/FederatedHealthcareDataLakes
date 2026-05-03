'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, storage } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Loader2, Lock, User, Activity, Shield, Database, Workflow } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({ username: '', password: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await api.login(formData.username, formData.password);
      storage.setToken(response.token);
      storage.setUserInfo(response.user);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-slate-900 p-12 text-white relative overflow-hidden">
        {/* Decorative gradient */}
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-cyan-500/15 blur-3xl" />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold">Hospital Node</span>
          </div>
          <p className="text-sm text-slate-400">Federated Data Sharing Portal</p>
        </div>

        <div className="relative z-10 space-y-8">
          <h2 className="text-3xl font-bold leading-tight">
            Manage your hospital&apos;s<br />
            <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              data sharing node
            </span>
          </h2>

          <div className="grid grid-cols-1 gap-4">
            {[
              { icon: Shield, title: 'Secure Handshake', desc: 'Authenticate with the central control plane' },
              { icon: Database, title: 'Data Requests', desc: 'Review and respond to data access requests' },
              { icon: Workflow, title: 'ETL Pipeline', desc: 'Extract, transform, and share FHIR data' },
            ].map((f) => (
              <div key={f.title} className="flex items-start gap-3 rounded-xl bg-white/5 border border-white/10 p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600/20">
                  <f.icon className="h-4 w-4 text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{f.title}</p>
                  <p className="text-xs text-slate-400">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-xs text-slate-500">
          ::::
        </p>
      </div>

      {/* Right form panel */}
      <div className="flex w-full lg:w-1/2 flex-col items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold text-slate-900">Hospital Node</span>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 mb-1">Welcome back</h1>
          <p className="text-sm text-slate-500 mb-8">Sign in to your hospital node portal</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  required
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="Enter your username"
                  className="pl-10 h-11"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  required
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Enter your password"
                  className="pl-10 h-11"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-medium text-sm
                         hover:from-blue-700 hover:to-cyan-700 transition-all duration-200
                         disabled:opacity-50 disabled:cursor-not-allowed
                         flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign In'
              )}
            </button>

          </form>
        </div>
      </div>
    </div>
  );
}
