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
  Building2,
  Mail,
  Lock,
  AlertCircle,
  CheckCircle,
  Loader2,
  Database,
  Network,
  Activity,
  ArrowRight,
} from 'lucide-react'

export default function HospitalRegisterPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setSubmitting(true)

    try {
      await api.hospitalRegister(formData.name, formData.email, formData.password)
      setSuccess(true)
      setTimeout(() => {
        router.push('/hospital/login')
      }, 2000)
    } catch (err: any) {
      setError(err.message || 'Failed to register hospital')
    } finally {
      setSubmitting(false)
    }
  }

  /* ── Success state ── */
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center space-y-6">
          <div className="relative mx-auto w-20 h-20">
            <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" />
            <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
              <CheckCircle className="w-10 h-10 text-white" />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-white">Registration Successful!</h2>
            <p className="text-slate-400 max-w-sm">
              Your hospital registration has been submitted for review.
            </p>
            <p className="text-sm text-slate-500 pt-2">
              Redirecting to login…
            </p>
            <div className="flex items-center justify-center gap-1.5 pt-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ── Registration form ── */
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
            Join the federated healthcare network — register your hospital today.
          </p>

          <div className="space-y-4 w-full max-w-xs">
            {[
              { icon: Database, text: 'Unified data lake governance' },
              { icon: Network, text: 'Multi-hospital federation' },
              { icon: Activity, text: 'Real-time pipeline monitoring' },
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
                Hospital Registration
              </CardTitle>
              <CardDescription className="text-slate-500">
                Fill in your hospital details to join the federated network
              </CardDescription>
            </CardHeader>

            <CardContent className="px-0 lg:px-6">
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Hospital Name */}
                <div className="space-y-2">
                  <label htmlFor="name" className="text-sm font-medium text-slate-700">
                    Hospital Name
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      id="name"
                      type="text"
                      placeholder="General Hospital"
                      className="pl-10"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      disabled={submitting}
                    />
                  </div>
                </div>

                {/* Admin Email */}
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium text-slate-700">
                    Admin Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="admin@hospital.com"
                      className="pl-10"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                      disabled={submitting}
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
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      required
                      minLength={8}
                      disabled={submitting}
                    />
                  </div>
                  <p className="text-xs text-slate-500">Minimum 8 characters</p>
                </div>

                {/* Confirm Password */}
                <div className="space-y-2">
                  <label htmlFor="confirmPassword" className="text-sm font-medium text-slate-700">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      id="confirmPassword"
                      type="password"
                      placeholder="••••••••"
                      className="pl-10"
                      value={formData.confirmPassword}
                      onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                      required
                      disabled={submitting}
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
                  disabled={submitting}
                  className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-md shadow-violet-500/20 transition-all"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Registering…
                    </>
                  ) : (
                    <>
                      Register Hospital
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>

              {/* Links */}
              <div className="mt-6 space-y-3 text-center">
                <div>
                  <span className="text-sm text-slate-500">Already registered? </span>
                  <Link
                    href="/hospital/login"
                    className="inline-flex items-center gap-1 text-sm text-violet-600 hover:text-violet-700 font-medium transition-colors"
                  >
                    Hospital Login
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <div>
                  <Link
                    href="/login"
                    className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    Admin Portal →
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

