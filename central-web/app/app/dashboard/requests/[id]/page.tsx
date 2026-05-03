'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { api, DataAccessRequest, NodeAccessResponse, Requestor } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import {
  ArrowLeft,
  AlertCircle,
  RefreshCw,
  Building2,
  CheckCircle2,
  XCircle,
  Clock,
  Key,
  Shield,
  Calendar,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  User,
  Database,
  Eye,
  EyeOff,
  Tag,
  Timer,
} from 'lucide-react'

/* ─── helpers ─── */

function statusBadge(status: string) {
  const s = status.toUpperCase()
  const map: Record<string, { label: string; cls: string }> = {
    FORWARDED: {
      label: 'Forwarded',
      cls: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
    },
    PARTIAL_APPROVED: {
      label: 'Partial Approved',
      cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
    },
    APPROVED: {
      label: 'Approved',
      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
    },
    REJECTED: {
      label: 'Rejected',
      cls: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800',
    },
    PENDING: {
      label: 'Pending',
      cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
    },
    COMPLETED: {
      label: 'Completed',
      cls: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800',
    },
    PROCESSING: {
      label: 'Processing',
      cls: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800',
    },
    EXPIRED: {
      label: 'Expired',
      cls: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    },
  }
  const entry = map[s] ?? {
    label: status,
    cls: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  }
  return (
    <Badge variant="outline" className={`font-medium text-xs px-2.5 py-0.5 ${entry.cls}`}>
      {entry.label}
    </Badge>
  )
}

function statusIcon(status: string) {
  switch (status.toUpperCase()) {
    case 'APPROVED':
      return <CheckCircle2 className="h-5 w-5 text-emerald-500" />
    case 'REJECTED':
      return <XCircle className="h-5 w-5 text-rose-500" />
    default:
      return <Clock className="h-5 w-5 text-amber-500" />
  }
}

/* ─── credential field (maskable + copyable) ─── */

function CredentialField({
  label,
  value,
  fieldKey,
  copied,
  onCopy,
}: {
  label: string
  value: string
  fieldKey: string
  copied: string | null
  onCopy: (value: string, key: string) => void
}) {
  const [visible, setVisible] = useState(false)
  const masked = value.slice(0, 6) + '••••••••••••' + value.slice(-4)

  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
      </label>
      <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900 px-3 py-2">
        <code className="flex-1 text-[13px] font-mono text-slate-800 dark:text-slate-200 break-all leading-relaxed select-all">
          {visible ? value : masked}
        </code>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          onClick={(e) => {
            e.stopPropagation()
            setVisible((v) => !v)
          }}
          title={visible ? 'Hide' : 'Reveal'}
        >
          {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          onClick={(e) => {
            e.stopPropagation()
            onCopy(value, fieldKey)
          }}
          title="Copy"
        >
          {copied === fieldKey ? (
            <Check className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </div>
  )
}

/* ─── main page ─── */

export default function RequestDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const requestId = params.id as string

  const [request, setRequest] = useState<DataAccessRequest | null>(null)
  const [requestorDetails, setRequestorDetails] = useState<Requestor | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedResponses, setExpandedResponses] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    if (requestId) loadRequest()
  }, [requestId])

  const loadRequest = async () => {
    try {
      setLoading(true)
      setError('')
      const data = await api.getRequestById(requestId)
      setRequest(data)
      try {
        const requestors = await api.getAllRequestors()
        const match = requestors.find((r) => r.id === data.requestor_id)
        setRequestorDetails(match || null)
      } catch {
        setRequestorDetails(null)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const toggleResponse = (id: string) => {
    setExpandedResponses((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(field)
    setTimeout(() => setCopied(null), 2000)
  }

  /* ── loading skeleton ── */
  if (loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-8 py-2">
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-24 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-80" />
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
        </div>
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    )
  }

  /* ── error state ── */
  if (error) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 py-2">
        <Button variant="ghost" onClick={() => router.back()} className="gap-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100">
          <ArrowLeft className="w-4 h-4" /> Back to Requests
        </Button>
        <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/50 px-5 py-4 text-rose-700 dark:text-rose-300">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      </div>
    )
  }

  /* ── not found ── */
  if (!request) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 py-2">
        <Button variant="ghost" onClick={() => router.back()} className="gap-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100">
          <ArrowLeft className="w-4 h-4" /> Back to Requests
        </Button>
        <div className="text-center py-16">
          <Database className="h-12 w-12 mx-auto mb-4 text-slate-300 dark:text-slate-600" />
          <p className="text-lg font-semibold text-slate-700 dark:text-slate-300">Request not found</p>
          <p className="text-sm text-slate-500 mt-1">The request may have been deleted or the ID is invalid.</p>
        </div>
      </div>
    )
  }

  const requestorName =
    requestorDetails?.name || request.requestor_email || request.requestor_id
  const requestorEmail = requestorDetails?.email || request.requestor_email
  const requestorOrg = requestorDetails?.organization

  /* ── main content ── */
  return (
    <div className="max-w-5xl mx-auto space-y-8 py-2">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.back()}
            className="gap-1.5 rounded-lg border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              Request Details
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Requested by {requestorName}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 font-mono mt-1">
              {request.id}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {statusBadge(request.status)}
          <Button
            variant="outline"
            size="sm"
            onClick={loadRequest}
            className="gap-1.5 rounded-lg border-slate-200 dark:border-slate-700"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* ── Overview cards grid ── */}
      <div className="grid gap-5 md:grid-cols-2">
        {/* Requestor info */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-200">
              <User className="h-4 w-4 text-violet-500" />
              Requestor
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs font-medium uppercase text-slate-400 dark:text-slate-500 tracking-wider">Name</p>
              <p className="text-sm text-slate-700 dark:text-slate-300 mt-0.5">{requestorName}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-slate-400 dark:text-slate-500 tracking-wider">Email</p>
              <p className="text-sm text-slate-700 dark:text-slate-300 mt-0.5">{requestorEmail}</p>
            </div>
            {requestorOrg && (
              <div>
                <p className="text-xs font-medium uppercase text-slate-400 dark:text-slate-500 tracking-wider">Organization</p>
                <p className="text-sm text-slate-700 dark:text-slate-300 mt-0.5">{requestorOrg}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-medium uppercase text-slate-400 dark:text-slate-500 tracking-wider">Requestor ID</p>
              <p className="text-sm font-mono text-slate-700 dark:text-slate-300 mt-0.5">{request.requestor_id}</p>
            </div>
          </CardContent>
        </Card>

        {/* Timeline / request summary */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-200">
              <Timer className="h-4 w-4 text-violet-500" />
              Request Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs font-medium uppercase text-slate-400 dark:text-slate-500 tracking-wider">Purpose</p>
              <p className="text-sm text-slate-700 dark:text-slate-300 mt-0.5 leading-relaxed">{request.purpose}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-slate-400 dark:text-slate-500 tracking-wider">Created</p>
              <p className="text-sm text-slate-700 dark:text-slate-300 mt-0.5">{formatDate(request.created_at)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-slate-400 dark:text-slate-500 tracking-wider">Expires</p>
              <p className="text-sm text-slate-700 dark:text-slate-300 mt-0.5">{formatDate(request.expires_at)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Data Query ── */}
      {request.data_query && (
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-200">
              <Database className="h-4 w-4 text-violet-500" />
              Data Query
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <pre className="text-[13px] leading-relaxed font-mono bg-slate-900 text-slate-100 p-4 rounded-xl overflow-auto max-h-64 scrollbar-thin">
                {JSON.stringify(request.data_query, null, 2)}
              </pre>
              <Button
                size="sm"
                variant="ghost"
                className="absolute top-2.5 right-2.5 h-7 w-7 p-0 text-slate-400 hover:text-white hover:bg-slate-700"
                onClick={() => copyToClipboard(JSON.stringify(request.data_query, null, 2), 'data-query')}
                title="Copy query"
              >
                {copied === 'data-query' ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Hospital Responses ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-50">
            <Building2 className="h-5 w-5 text-violet-500" />
            Hospital Responses
            <span className="text-sm font-normal text-slate-500 dark:text-slate-400 ml-1">
              ({request.responses?.length || 0})
            </span>
          </h2>
        </div>

        {!request.responses || request.responses.length === 0 ? (
          <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
            <CardContent className="py-14 text-center">
              <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <Clock className="h-7 w-7 text-slate-400 dark:text-slate-500" />
              </div>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                Waiting for hospital responses&hellip;
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                Responses will appear here once hospitals review the request.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {request.responses.map((response: NodeAccessResponse) => {
              const isExpanded = expandedResponses.has(response.id)
              const canExpand = response.status === 'APPROVED'
              const hospitalName =
                response.hospital?.name || `Hospital ${response.hospital_id.substring(0, 8)}…`

              return (
                <Card
                  key={response.id}
                  className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden"
                >
                  {/* ─ Collapsible header ─ */}
                  <button
                    type="button"
                    className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    onClick={() => canExpand && toggleResponse(response.id)}
                    disabled={!canExpand}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {statusIcon(response.status)}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
                          {hospitalName}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {response.hospital?.email || response.hospital_id}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {response.responded_at && (
                        <span className="hidden sm:inline text-xs text-slate-400 dark:text-slate-500">
                          {formatDate(response.responded_at)}
                        </span>
                      )}
                      {statusBadge(response.status)}
                      {canExpand && (
                        <span className="text-slate-400 dark:text-slate-500 transition-transform duration-200">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </span>
                      )}
                    </div>
                  </button>

                  {/* ─ Rejected note (always visible) ─ */}
                  {response.status === 'REJECTED' && response.notes && (
                    <div className="mx-5 mb-4 rounded-lg border border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/40 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400 mb-1">
                        Rejection Reason
                      </p>
                      <p className="text-sm text-rose-700 dark:text-rose-300 leading-relaxed">
                        {response.notes}
                      </p>
                    </div>
                  )}

                  {/* ─ Expanded approved content ─ */}
                  {isExpanded && response.status === 'APPROVED' && (
                    <div className="border-t border-slate-100 dark:border-slate-800">
                      <div className="px-5 py-5 space-y-5">
                        {/* Meta pills row */}
                        <div className="flex flex-wrap gap-3">
                          {response.date_range_start && response.date_range_end && (
                            <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/40 px-3 py-2">
                              <Calendar className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                              <span className="text-xs font-medium text-sky-700 dark:text-sky-300">
                                {response.date_range_start} → {response.date_range_end}
                              </span>
                            </div>
                          )}
                          {response.departments && response.departments.length > 0 && (
                            <div className="flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/40 px-3 py-2">
                              <Tag className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                              <span className="text-xs font-medium text-violet-700 dark:text-violet-300">
                                {response.departments.join(', ')}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Notes */}
                        {response.notes && (
                          <div className="rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900 px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                              Notes
                            </p>
                            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                              {response.notes}
                            </p>
                          </div>
                        )}

                        {/* Credentials */}
                        {response.access_key_id && (
                          <div className="space-y-4">
                            <div className="flex items-center gap-2">
                              <Key className="h-4 w-4 text-emerald-500" />
                              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                                Temporary Credentials
                              </h4>
                            </div>

                            <Separator className="bg-slate-100 dark:bg-slate-800" />

                            <div className="grid gap-3">
                              <CredentialField
                                label="Access Key ID"
                                value={response.access_key_id}
                                fieldKey={`${response.id}-access`}
                                copied={copied}
                                onCopy={copyToClipboard}
                              />
                              {response.secret_access_key && (
                                <CredentialField
                                  label="Secret Access Key"
                                  value={response.secret_access_key}
                                  fieldKey={`${response.id}-secret`}
                                  copied={copied}
                                  onCopy={copyToClipboard}
                                />
                              )}
                              {response.session_token && (
                                <CredentialField
                                  label="Session Token"
                                  value={response.session_token}
                                  fieldKey={`${response.id}-session`}
                                  copied={copied}
                                  onCopy={copyToClipboard}
                                />
                              )}
                            </div>

                            {response.cred_expiration && (
                              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 px-3 py-2.5">
                                <Timer className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                                <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                                  Credentials expire {new Date(response.cred_expiration).toLocaleString()}
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Show message if no credentials */}
                        {!response.access_key_id && (
                          <div className="text-center py-6 text-slate-400 dark:text-slate-500">
                            <Key className="h-6 w-6 mx-auto mb-2 opacity-40" />
                            <p className="text-sm">No credentials provided yet</p>
                          </div>
                        )}

                        {/* IAM Policy */}
                        {response.policy_json && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Shield className="h-4 w-4 text-indigo-500" />
                              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                                IAM Policy
                              </h4>
                            </div>
                            <div className="relative">
                              <pre className="text-[13px] leading-relaxed font-mono bg-slate-900 text-slate-100 p-4 rounded-xl overflow-auto max-h-56 scrollbar-thin">
                                {JSON.stringify(JSON.parse(response.policy_json), null, 2)}
                              </pre>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="absolute top-2.5 right-2.5 h-7 w-7 p-0 text-slate-400 hover:text-white hover:bg-slate-700"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  copyToClipboard(response.policy_json!, `${response.id}-policy`)
                                }}
                                title="Copy policy"
                              >
                                {copied === `${response.id}-policy` ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
