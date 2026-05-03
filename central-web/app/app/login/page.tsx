'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/lib/api'
import {
  Shield,
  Lock,
  User,
  AlertCircle,
  Loader2,
  Database,
  Network,
  Activity,
  ArrowRight,
} from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await api.adminLogin(username, password)
      router.push('/dashboard')
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* ── Left branding panel ── */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-slate-900">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-600/20 via-slate-900 to-indigo-900/40" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
        <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-violet-600/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-[28rem] w-[28rem] rounded-full bg-indigo-600/10 blur-3xl" />

        <div className="relative z-10 flex flex-col items-center justify-center w-full px-12 text-center">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-2xl shadow-violet-500/25 mb-8">
            <Shield className="w-10 h-10 text-white" />
          </div>

          <h1 className="text-4xl font-bold text-white tracking-tight mb-3">
            HMS Central
            <span className="block text-violet-400">Control Plane</span>
          </h1>
          <p className="text-slate-400 text-lg max-w-sm leading-relaxed mb-12">
            Manage hospital registrations, requestors, and data access approvals in one place.
          </p>

          <div className="space-y-4 w-full max-w-xs">
            {[
              { icon: Database, text: 'Review data access requests' },
              { icon: Network, text: 'Approve hospital registrations' },
              { icon: Activity, text: 'Manage requestor accounts' },
            ].map(({ icon: Icon, text }) => (
              <div
                key={text}
                className="flex items-center gap-3 rounded-lg border border-slate-700/60 bg-slate-800/50 px-4 py-3 backdrop-blur-sm"
              >
                <Icon className="h-5 w-5 shrink-0 text-violet-400" />
                <span className="text-sm text-slate-300">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex w-full lg:w-1/2 items-center justify-center bg-white p-6 sm:p-12">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile-only header */}
          <div className="flex flex-col items-center lg:hidden mb-4">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20 mb-4">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">HMS Central Control</h1>
          </div>

          <Card className="border-0 shadow-none lg:border lg:shadow-sm">
            <CardHeader className="px-0 lg:px-6">
              <CardTitle className="text-2xl font-semibold text-slate-900">
                Admin Sign In
              </CardTitle>
              <CardDescription className="text-slate-500">
                Sign in to manage the central control plane
              </CardDescription>
            </CardHeader>

            <CardContent className="px-0 lg:px-6">
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Username */}
                <div className="space-y-2">
                  <label htmlFor="username" className="text-sm font-medium text-slate-700">
                    Username
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      id="username"
                      type="text"
                      placeholder="admin"
                      className="pl-10"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <label htmlFor="password" className="text-sm font-medium text-slate-700">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      className="pl-10"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Submit */}
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-md shadow-violet-500/20 transition-all"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in…
                    </>
                  ) : (
                    <>
                      Sign In
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>

              {/* Links */}
              <div className="mt-6 text-center">
                <Link
                  href="/hospital/login"
                  className="inline-flex items-center gap-1 text-sm text-violet-600 hover:text-violet-700 font-medium transition-colors"
                >
                  Hospital Portal Login
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

