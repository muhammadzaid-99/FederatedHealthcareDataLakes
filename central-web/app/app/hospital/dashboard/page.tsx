'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import {
  Building2,
  Key,
  CheckCircle,
  Clock,
  XCircle,
  Copy,
  LogOut,
  AlertCircle,
  FileText,
  Loader2,
  ShieldCheck,
  Eye,
  RefreshCw,
  Server,
  Network,
  Activity,
  Lock,
  Check,
  Mail,
  Hash,
  CalendarDays,
} from 'lucide-react'
import { api } from '@/lib/api'

interface HospitalInfo {
  id: string
  name: string
  email: string
  status: string
  client_id?: string
  client_secret?: string
  nessie_namespace?: string
  queue_name?: string
  created_at: string
  updated_at: string
  handshake_at?: string
}

export default function HospitalDashboardPage() {
  const router = useRouter()
  const [hospital, setHospital] = useState<HospitalInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copiedField, setCopiedField] = useState<string | null>(null)

  // Generate credentials modal states
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [password, setPassword] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')
  const [newCredentials, setNewCredentials] = useState<{
    client_id: string
    client_secret: string
  } | null>(null)

  useEffect(() => {
    loadHospitalInfo()
  }, [])

  const loadHospitalInfo = async () => {
    try {
      const data = await api.getHospitalStatus()
      setHospital(data.hospital)
    } catch (err: any) {
      if (err.message?.includes('401') || err.message?.includes('Unauthorized')) {
        router.push('/hospital/login')
        return
      }
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    try {
      await api.hospitalLogout()
    } catch (e) {
      // ignore
    }
    router.push('/hospital/login')
  }

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const handleGenerateSecret = async (e: React.FormEvent) => {
    e.preventDefault()
    setGenerating(true)
    setGenerateError('')

    try {
      const data = await api.generateCredentials(password)
      setNewCredentials({
        client_id: data.client_id,
        client_secret: data.client_secret,
      })
      await loadHospitalInfo()
      setPassword('')
    } catch (err: any) {
      setGenerateError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  const closeGenerateModal = () => {
    setShowGenerateModal(false)
    setPassword('')
    setGenerateError('')
    setNewCredentials(null)
  }

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'PENDING':
        return {
          badge: (
            <Badge className="bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-50 px-3 py-1 text-xs font-medium">
              <Clock className="w-3 h-3 mr-1.5" />
              Pending Approval
            </Badge>
          ),
          dot: 'bg-amber-400',
          ring: 'ring-amber-400/20',
        }
      case 'CREDENTIALS_ISSUED':
        return {
          badge: (
            <Badge className="bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-50 px-3 py-1 text-xs font-medium">
              <Key className="w-3 h-3 mr-1.5" />
              Credentials Issued
            </Badge>
          ),
          dot: 'bg-sky-400',
          ring: 'ring-sky-400/20',
        }
      case 'ACTIVE':
        return {
          badge: (
            <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-50 px-3 py-1 text-xs font-medium">
              <CheckCircle className="w-3 h-3 mr-1.5" />
              Active
            </Badge>
          ),
          dot: 'bg-emerald-400',
          ring: 'ring-emerald-400/20',
        }
      case 'REJECTED':
        return {
          badge: (
            <Badge className="bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-50 px-3 py-1 text-xs font-medium">
              <XCircle className="w-3 h-3 mr-1.5" />
              Rejected
            </Badge>
          ),
          dot: 'bg-rose-400',
          ring: 'ring-rose-400/20',
        }
      default:
        return {
          badge: <Badge variant="outline">{status}</Badge>,
          dot: 'bg-slate-400',
          ring: 'ring-slate-400/20',
        }
    }
  }

  /* ------------------------------------------------------------------ */
  /*  COPY BUTTON                                                        */
  /* ------------------------------------------------------------------ */
  const CopyButton = ({ value, field }: { value: string; field: string }) => (
    <Button
      size="sm"
      variant="ghost"
      className="h-8 w-8 p-0 text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors shrink-0"
      onClick={() => copyToClipboard(value, field)}
    >
      {copiedField === field ? (
        <Check className="w-3.5 h-3.5 text-teal-500" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
    </Button>
  )

  /* ------------------------------------------------------------------ */
  /*  CREDENTIAL ROW – dark code block style                             */
  /* ------------------------------------------------------------------ */
  const CredentialRow = ({
    label,
    value,
    field,
    mono = true,
    icon,
  }: {
    label: string
    value: string
    field: string
    mono?: boolean
    icon?: React.ReactNode
  }) => (
    <div className="space-y-1.5">
      <label className="text-xs font-medium uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
        {icon}
        {label}
      </label>
      <div className="flex items-center gap-2 bg-slate-900 rounded-lg px-4 py-2.5 group">
        <code className={`flex-1 text-sm text-slate-100 break-all ${mono ? 'font-mono' : ''}`}>
          {value}
        </code>
        <CopyButton value={value} field={field} />
      </div>
    </div>
  )

  /* ------------------------------------------------------------------ */
  /*  LOADING STATE                                                      */
  /* ------------------------------------------------------------------ */
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50/40">
        <div className="border-b border-slate-200/80 bg-white/70 backdrop-blur-md">
          <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-44" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
            <Skeleton className="h-9 w-24 rounded-lg" />
          </div>
        </div>
        <div className="max-w-5xl mx-auto p-6 space-y-6">
          <Skeleton className="h-48 rounded-2xl" />
          <div className="grid md:grid-cols-2 gap-6">
            <Skeleton className="h-64 rounded-2xl" />
            <Skeleton className="h-64 rounded-2xl" />
          </div>
        </div>
      </div>
    )
  }

  /* ------------------------------------------------------------------ */
  /*  ERROR STATE                                                        */
  /* ------------------------------------------------------------------ */
  if (error || !hospital) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50/40 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-0 shadow-xl shadow-slate-200/50 rounded-2xl">
          <CardContent className="pt-10 pb-8 px-8">
            <div className="text-center">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-rose-50">
                <AlertCircle className="w-8 h-8 text-rose-500" />
              </div>
              <h2 className="text-xl font-semibold text-slate-900 mb-2">Unable to Load Dashboard</h2>
              <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                {error || 'Failed to load hospital information. Please try again.'}
              </p>
              <Button
                onClick={() => router.push('/hospital/login')}
                className="bg-slate-900 hover:bg-slate-800 text-white rounded-lg px-6"
              >
                Back to Login
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const statusConfig = getStatusConfig(hospital.status)

  /* ------------------------------------------------------------------ */
  /*  MAIN RENDER                                                        */
  /* ------------------------------------------------------------------ */
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50/40">
      {/* ====== HEADER ====== */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/70 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-blue-600 shadow-lg shadow-teal-500/20">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900 leading-tight">{hospital.name}</h1>
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <Mail className="w-3 h-3" />
                {hospital.email}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {statusConfig.badge}
            <div className="h-6 w-px bg-slate-200" />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-slate-500 hover:text-rose-600 hover:bg-rose-50 gap-1.5 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline text-sm">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      {/* ====== CONTENT ====== */}
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* ---------- STATUS BANNER ---------- */}
        <Card className="border-0 shadow-lg shadow-slate-200/40 rounded-2xl overflow-hidden">
          <div
            className={`h-1 ${
              hospital.status === 'ACTIVE'
                ? 'bg-gradient-to-r from-emerald-400 to-teal-400'
                : hospital.status === 'CREDENTIALS_ISSUED'
                ? 'bg-gradient-to-r from-sky-400 to-blue-500'
                : hospital.status === 'REJECTED'
                ? 'bg-gradient-to-r from-rose-400 to-pink-500'
                : 'bg-gradient-to-r from-amber-400 to-orange-400'
            }`}
          />

          <CardContent className="p-6">
            {hospital.status === 'PENDING' && (
              <div className="flex items-start gap-4 bg-amber-50/70 border border-amber-200/60 rounded-xl p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100">
                  <Clock className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-amber-900 text-sm">Awaiting Admin Approval</h3>
                  <p className="text-sm text-amber-700/80 mt-0.5 leading-relaxed">
                    Your hospital registration is under review. You will receive credentials once approved by the
                    central administrator.
                  </p>
                </div>
              </div>
            )}

            {hospital.status === 'REJECTED' && (
              <div className="flex items-start gap-4 bg-rose-50/70 border border-rose-200/60 rounded-xl p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-100">
                  <XCircle className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-rose-900 text-sm">Registration Rejected</h3>
                  <p className="text-sm text-rose-700/80 mt-0.5 leading-relaxed">
                    Your hospital registration was not approved. Please contact the administrator for more information.
                  </p>
                </div>
              </div>
            )}

            {(hospital.status === 'CREDENTIALS_ISSUED' || hospital.status === 'ACTIVE') && (
              <div className="flex items-start gap-4 bg-teal-50/70 border border-teal-200/60 rounded-xl p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-100">
                  <CheckCircle className="w-5 h-5 text-teal-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-teal-900 text-sm">
                    {hospital.status === 'ACTIVE' ? 'Fully Activated' : 'Approved — Credentials Available'}
                  </h3>
                  <p className="text-sm text-teal-700/80 mt-0.5 leading-relaxed">
                    {hospital.status === 'ACTIVE'
                      ? 'Your hospital is fully connected to the federated network.'
                      : 'Your hospital has been approved. Use the credentials below to connect your node.'}
                  </p>
                </div>
              </div>
            )}

            {/* Meta info pills */}
            <div className="mt-5 flex flex-wrap gap-3">
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/60 rounded-lg px-3 py-2 text-xs text-slate-600">
                <Hash className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-mono text-[11px]">{hospital.id}</span>
              </div>
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/60 rounded-lg px-3 py-2 text-xs text-slate-600">
                <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                Registered{' '}
                {new Date(hospital.created_at).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </div>
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/60 rounded-lg px-3 py-2 text-xs text-slate-600">
                <div className={`h-2 w-2 rounded-full ${statusConfig.dot} ring-4 ${statusConfig.ring}`} />
                {hospital.status.replace('_', ' ')}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ---------- CREDENTIALS & INFRA GRID ---------- */}
        {(hospital.status === 'ACTIVE' || hospital.status === 'CREDENTIALS_ISSUED') && (
          <div className="grid lg:grid-cols-5 gap-6">
            {/* Credentials – wider column */}
            <Card className="lg:col-span-3 border-0 shadow-lg shadow-slate-200/40 rounded-2xl">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50">
                    <Key className="w-4 h-4 text-blue-600" />
                  </div>
                  API Credentials
                </CardTitle>
                <CardDescription className="text-xs text-slate-400">
                  Use these credentials to connect your hospital node to the network
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4 pt-2">
                {!hospital.client_id ? (
                  /* No credentials yet */
                  <div className="space-y-4">
                    <div className="rounded-xl bg-gradient-to-br from-blue-50 to-teal-50/50 border border-blue-200/50 p-5">
                      <div className="flex items-center gap-2.5 mb-2">
                        <ShieldCheck className="w-5 h-5 text-blue-600" />
                        <p className="font-semibold text-blue-900 text-sm">Generate Your Client Credentials</p>
                      </div>
                      <p className="text-sm text-blue-700/80 mb-5 leading-relaxed">
                        Your hospital has been approved! Generate your client credentials to connect your node to the
                        federated network.
                      </p>
                      <Button
                        onClick={() => setShowGenerateModal(true)}
                        className="w-full bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700 text-white shadow-md shadow-blue-500/20 rounded-lg h-10"
                      >
                        <Key className="w-4 h-4 mr-2" />
                        Generate Client Credentials
                      </Button>
                    </div>

                    {hospital.nessie_namespace && (
                      <CredentialRow
                        label="Nessie Namespace"
                        value={hospital.nessie_namespace}
                        field="nessie"
                        icon={<Server className="w-3 h-3" />}
                      />
                    )}
                    {hospital.queue_name && (
                      <CredentialRow
                        label="RabbitMQ Queue"
                        value={hospital.queue_name}
                        field="queue"
                        icon={<Network className="w-3 h-3" />}
                      />
                    )}
                  </div>
                ) : (
                  /* Has credentials */
                  <div className="space-y-4">
                    <div className="flex items-start gap-3 bg-blue-50/60 border border-blue-200/40 rounded-xl px-4 py-3">
                      <Lock className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                      <p className="text-xs text-blue-700/70 leading-relaxed">
                        <span className="font-semibold text-blue-800">Keep these credentials secure.</span> They
                        provide access to your hospital&apos;s data infrastructure. Never share them publicly.
                      </p>
                    </div>

                    <CredentialRow
                      label="Client ID"
                      value={hospital.client_id}
                      field="client_id"
                      icon={<Hash className="w-3 h-3" />}
                    />

                    {/* Client Secret – masked */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <Lock className="w-3 h-3" />
                        Client Secret
                      </label>
                      <div className="flex items-center gap-2 bg-slate-900 rounded-lg px-4 py-2.5">
                        <span className="flex-1 text-sm text-slate-500 font-mono tracking-widest select-none">
                          ••••••••••••••••••••••••
                        </span>
                        <span className="text-[10px] font-medium text-slate-500 bg-slate-800 rounded px-1.5 py-0.5 mr-1">
                          ENCRYPTED
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-slate-500 hover:text-teal-400 hover:bg-slate-800 transition-colors shrink-0"
                          onClick={() => setShowGenerateModal(true)}
                          title="View secret (requires password)"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-slate-500 hover:text-teal-400 hover:bg-slate-800 transition-colors shrink-0"
                          onClick={() => setShowGenerateModal(true)}
                          title="Regenerate credentials"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Click the eye or refresh icon to view / regenerate (password required)
                      </p>
                    </div>

                    {hospital.nessie_namespace && (
                      <CredentialRow
                        label="Nessie Namespace"
                        value={hospital.nessie_namespace}
                        field="nessie"
                        icon={<Server className="w-3 h-3" />}
                      />
                    )}
                    {hospital.queue_name && (
                      <CredentialRow
                        label="RabbitMQ Queue"
                        value={hospital.queue_name}
                        field="queue"
                        icon={<Network className="w-3 h-3" />}
                      />
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Infrastructure sidebar */}
            <Card className="lg:col-span-2 border-0 shadow-lg shadow-slate-200/40 rounded-2xl">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50">
                    <Activity className="w-4 h-4 text-teal-600" />
                  </div>
                  Infrastructure
                </CardTitle>
                <CardDescription className="text-xs text-slate-400">
                  Resources provisioned for your hospital
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-2 space-y-3">
                {[
                  {
                    label: 'Nessie Namespace',
                    value: hospital.nessie_namespace,
                    icon: <Server className="w-4 h-4 text-teal-500" />,
                  },
                  {
                    label: 'Message Queue',
                    value: hospital.queue_name,
                    icon: <Network className="w-4 h-4 text-blue-500" />,
                  },
                  {
                    label: 'Status',
                    value: hospital.status.replace('_', ' '),
                    icon: <Activity className="w-4 h-4 text-emerald-500" />,
                  },
                ].map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between bg-slate-50/80 border border-slate-100 rounded-xl px-4 py-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {item.icon}
                      <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
                          {item.label}
                        </p>
                        <p className="text-sm font-mono text-slate-700 truncate">{item.value || '—'}</p>
                      </div>
                    </div>
                    {item.value && <CopyButton value={item.value} field={`infra-${i}`} />}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ---------- DATA REQUESTS ---------- */}
        <Card className="border-0 shadow-lg shadow-slate-200/40 rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50">
                <FileText className="w-4 h-4 text-sky-600" />
              </div>
              Incoming Data Requests
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Requests forwarded to your hospital queue
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100/80 mb-4">
                <FileText className="w-7 h-7 text-slate-300" />
              </div>
              <p className="text-sm font-medium text-slate-500">No incoming requests yet</p>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">
                Data access requests will appear here when submitted by researchers or other hospitals
              </p>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* ====== GENERATE / VIEW CREDENTIALS MODAL ====== */}
      {showGenerateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={!generating ? closeGenerateModal : undefined}
          />

          {/* Modal */}
          <Card className="relative z-10 w-full max-w-md border-0 shadow-2xl shadow-slate-900/20 rounded-2xl animate-in fade-in zoom-in-95 duration-200">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-teal-500 shadow-md shadow-blue-500/20">
                  <ShieldCheck className="w-4 h-4 text-white" />
                </div>
                {newCredentials
                  ? 'Credentials Generated'
                  : hospital.client_id
                  ? 'Generate New Credentials'
                  : 'Generate Client Credentials'}
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">
                {newCredentials
                  ? 'Save these credentials securely — they will not be shown again'
                  : 'Verify your password to generate client credentials'}
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-2">
              {!newCredentials ? (
                /* Password form */
                <form onSubmit={handleGenerateSecret} className="space-y-4">
                  <div className="bg-amber-50/70 border border-amber-200/50 rounded-xl p-3.5 flex items-start gap-3">
                    <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-700/80 leading-relaxed">
                      <span className="font-semibold text-amber-800">Important:</span> The client secret will only be
                      shown once. Make sure to save it securely.
                    </p>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700 block mb-2">Confirm Your Password</label>
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your hospital password"
                      required
                      disabled={generating}
                      autoFocus
                      className="rounded-lg border-slate-200 focus-visible:ring-teal-500/30 focus-visible:border-teal-500"
                    />
                  </div>

                  {generateError && (
                    <div className="bg-rose-50 border border-rose-200/60 rounded-xl p-3 flex items-center gap-2">
                      <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                      <p className="text-sm text-rose-700">{generateError}</p>
                    </div>
                  )}

                  <div className="flex gap-3 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={closeGenerateModal}
                      disabled={generating}
                      className="flex-1 rounded-lg border-slate-200 hover:bg-slate-50"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={generating || !password}
                      className="flex-1 rounded-lg bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700 text-white shadow-md shadow-blue-500/20"
                    >
                      {generating ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Generating…
                        </>
                      ) : (
                        <>
                          <Key className="w-4 h-4 mr-2" />
                          Generate
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              ) : (
                /* New credentials display */
                <div className="space-y-4">
                  <div className="bg-emerald-50/70 border border-emerald-200/50 rounded-xl p-3.5 flex items-start gap-3">
                    <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-emerald-800">Credentials Generated Successfully</p>
                      <p className="text-[11px] text-emerald-600 mt-0.5">
                        Save these credentials now — they won&apos;t be shown again!
                      </p>
                    </div>
                  </div>

                  <CredentialRow
                    label="Client ID"
                    value={newCredentials.client_id}
                    field="gen_client_id"
                    icon={<Hash className="w-3 h-3" />}
                  />

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Lock className="w-3 h-3" />
                      Client Secret
                      <span className="ml-1 text-[10px] font-semibold text-rose-500 uppercase tracking-wide">
                        Save this now!
                      </span>
                    </label>
                    <div className="flex items-center gap-2 bg-slate-900 rounded-lg px-4 py-2.5 ring-2 ring-amber-400/30">
                      <code className="flex-1 text-sm text-amber-200 font-mono break-all">
                        {newCredentials.client_secret}
                      </code>
                      <CopyButton value={newCredentials.client_secret} field="gen_client_secret" />
                    </div>
                    <p className="text-[11px] text-rose-400 flex items-center gap-1 mt-1">
                      <AlertCircle className="w-3 h-3" />
                      This is the only time you&apos;ll see this secret. Store it securely!
                    </p>
                  </div>

                  <Button
                    onClick={closeGenerateModal}
                    className="w-full rounded-lg bg-slate-900 hover:bg-slate-800 text-white h-10 mt-2"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    I&apos;ve Saved These Credentials
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
