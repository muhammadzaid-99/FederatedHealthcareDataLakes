'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api, Hospital } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Inbox,
  Building2,
  Mail,
  CalendarDays,
  RefreshCw,
  Loader2,
  ShieldCheck,
  ShieldX,
} from 'lucide-react'

type ActionType = 'approve' | 'reject'

interface ConfirmState {
  hospitalId: string
  action: ActionType
}

export default function PendingRegistrationsPage() {
  const [hospitals, setHospitals] = useState<Hospital[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [processingAction, setProcessingAction] = useState<ActionType | null>(null)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  const loadPendingRegistrations = useCallback(async (isRefresh = false) => {
    try {
      setError('')
      if (isRefresh) setRefreshing(true)
      const data = await api.getPendingRegistrations()
      setHospitals(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadPendingRegistrations()
  }, [loadPendingRegistrations])

  const handleAction = async (hospitalId: string, action: ActionType) => {
    // If not yet confirmed, show confirmation
    if (!confirm || confirm.hospitalId !== hospitalId || confirm.action !== action) {
      setConfirm({ hospitalId, action })
      return
    }

    // Confirmed — execute
    setConfirm(null)
    setProcessingId(hospitalId)
    setProcessingAction(action)
    try {
      if (action === 'approve') {
        await api.approveHospital(hospitalId)
      } else {
        await api.rejectHospital(hospitalId)
      }
      await loadPendingRegistrations()
    } catch (err: any) {
      setError(`Failed to ${action} hospital: ${err.message}`)
    } finally {
      setProcessingId(null)
      setProcessingAction(null)
    }
  }

  const cancelConfirm = () => setConfirm(null)

  const isProcessing = (id: string) => processingId === id
  const isConfirming = (id: string, action: ActionType) =>
    confirm?.hospitalId === id && confirm?.action === action

  // ── Loading skeleton ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-8">
        <div className="space-y-1">
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-5 w-96" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="border-slate-200 dark:border-slate-800">
              <CardHeader className="pb-3">
                <Skeleton className="h-5 w-40" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-4 w-36" />
                <div className="flex gap-2 pt-2">
                  <Skeleton className="h-9 w-24" />
                  <Skeleton className="h-9 w-24" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Pending Registrations
          </h2>
          <p className="text-slate-500 dark:text-slate-400">
            Review and manage incoming hospital registration requests
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Badge
            variant="secondary"
            className="bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 px-3 py-1 text-sm font-medium"
          >
            {hospitals.length} pending
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadPendingRegistrations(true)}
            disabled={refreshing}
            className="gap-1.5 border-slate-300 dark:border-slate-700"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Error banner ───────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">{error}</p>
          <button
            onClick={() => setError('')}
            className="ml-auto text-red-400 hover:text-red-600 dark:hover:text-red-200"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Empty state ────────────────────────────────────────────── */}
      {hospitals.length === 0 ? (
        <Card className="border-dashed border-2 border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <CardContent className="flex flex-col items-center justify-center py-20">
            <div className="rounded-full bg-slate-100 p-4 dark:bg-slate-800 mb-5">
              <Inbox className="h-10 w-10 text-slate-400 dark:text-slate-500" />
            </div>
            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-1">
              No pending registrations
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm text-center">
              All hospital registration requests have been processed. New requests will appear here automatically.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadPendingRegistrations(true)}
              className="mt-6 gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Check again
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ── Card grid (visible on small/medium screens) ── */}
          <div className="grid gap-4 md:grid-cols-2 xl:hidden">
            {hospitals.map((hospital) => {
              const processing = isProcessing(hospital.id)
              const confirmApprove = isConfirming(hospital.id, 'approve')
              const confirmReject = isConfirming(hospital.id, 'reject')

              return (
                <Card
                  key={hospital.id}
                  className={`relative overflow-hidden border-slate-200 dark:border-slate-800 transition-shadow hover:shadow-md ${
                    processing ? 'opacity-70 pointer-events-none' : ''
                  }`}
                >
                  {/* Top accent bar */}
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-500 to-indigo-500" />

                  <CardHeader className="pb-2 pt-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/40">
                          <Building2 className="h-4.5 w-4.5 text-violet-600 dark:text-violet-400" />
                        </div>
                        <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100 leading-tight">
                          {hospital.name}
                        </CardTitle>
                      </div>
                      <Badge className="shrink-0 bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800 gap-1 text-xs">
                        <Clock className="h-3 w-3" />
                        Pending
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4 pt-2">
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                        <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="truncate">{hospital.email}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                        <CalendarDays className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span>{formatDate(hospital.created_at)}</span>
                      </div>
                    </div>

                    {/* Confirmation inline banner */}
                    {(confirmApprove || confirmReject) && (
                      <div
                        className={`rounded-md px-3 py-2 text-xs font-medium ${
                          confirmApprove
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                            : 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300'
                        }`}
                      >
                        {confirmApprove
                          ? 'Click Approve again to confirm'
                          : 'Click Reject again to confirm'}
                      </div>
                    )}

                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={() => handleAction(hospital.id, 'approve')}
                        disabled={processing}
                        className={`flex-1 gap-1.5 text-white shadow-sm ${
                          confirmApprove
                            ? 'bg-emerald-600 hover:bg-emerald-700 ring-2 ring-emerald-300 dark:ring-emerald-700'
                            : 'bg-emerald-600 hover:bg-emerald-700'
                        }`}
                      >
                        {processing && processingAction === 'approve' ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ShieldCheck className="h-4 w-4" />
                        )}
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAction(hospital.id, 'reject')}
                        disabled={processing}
                        className={`flex-1 gap-1.5 ${
                          confirmReject
                            ? 'border-red-400 bg-red-50 text-red-700 hover:bg-red-100 ring-2 ring-red-300 dark:border-red-700 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-800'
                            : 'border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/50'
                        }`}
                      >
                        {processing && processingAction === 'reject' ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ShieldX className="h-4 w-4" />
                        )}
                        Reject
                      </Button>
                      {(confirmApprove || confirmReject) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={cancelConfirm}
                          className="px-2 text-slate-500"
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* ── Table (visible on xl screens) ──────────────────────── */}
          <Card className="hidden xl:block border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 dark:bg-slate-900/50 hover:bg-slate-50/80">
                    <TableHead className="font-semibold text-slate-600 dark:text-slate-400">
                      Hospital
                    </TableHead>
                    <TableHead className="font-semibold text-slate-600 dark:text-slate-400">
                      Email
                    </TableHead>
                    <TableHead className="font-semibold text-slate-600 dark:text-slate-400">
                      Registered
                    </TableHead>
                    <TableHead className="font-semibold text-slate-600 dark:text-slate-400">
                      Status
                    </TableHead>
                    <TableHead className="font-semibold text-slate-600 dark:text-slate-400 text-right">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hospitals.map((hospital) => {
                    const processing = isProcessing(hospital.id)
                    const confirmApprove = isConfirming(hospital.id, 'approve')
                    const confirmReject = isConfirming(hospital.id, 'reject')

                    return (
                      <TableRow
                        key={hospital.id}
                        className={`group transition-colors ${
                          processing ? 'opacity-60' : ''
                        } ${
                          confirmApprove
                            ? 'bg-emerald-50/50 dark:bg-emerald-950/20'
                            : confirmReject
                            ? 'bg-red-50/50 dark:bg-red-950/20'
                            : ''
                        }`}
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/40">
                              <Building2 className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                            </div>
                            <span className="font-semibold text-slate-900 dark:text-slate-100">
                              {hospital.name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-slate-600 dark:text-slate-400">
                          {hospital.email}
                        </TableCell>
                        <TableCell className="text-slate-600 dark:text-slate-400">
                          {formatDate(hospital.created_at)}
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800 gap-1">
                            <Clock className="h-3 w-3" />
                            Pending
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {(confirmApprove || confirmReject) && (
                              <span className="text-xs text-slate-500 mr-1">
                                Click again to confirm
                              </span>
                            )}
                            <Button
                              size="sm"
                              onClick={() => handleAction(hospital.id, 'approve')}
                              disabled={processing}
                              className={`gap-1.5 text-white shadow-sm transition-all ${
                                confirmApprove
                                  ? 'bg-emerald-600 hover:bg-emerald-700 ring-2 ring-emerald-300 dark:ring-emerald-700 scale-105'
                                  : 'bg-emerald-600 hover:bg-emerald-700'
                              }`}
                            >
                              {processing && processingAction === 'approve' ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <CheckCircle className="h-3.5 w-3.5" />
                              )}
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAction(hospital.id, 'reject')}
                              disabled={processing}
                              className={`gap-1.5 transition-all ${
                                confirmReject
                                  ? 'border-red-400 bg-red-50 text-red-700 hover:bg-red-100 ring-2 ring-red-300 dark:border-red-700 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-800 scale-105'
                                  : 'border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/50'
                              }`}
                            >
                              {processing && processingAction === 'reject' ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <XCircle className="h-3.5 w-3.5" />
                              )}
                              Reject
                            </Button>
                            {(confirmApprove || confirmReject) && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={cancelConfirm}
                                className="px-2 text-slate-500 h-8"
                              >
                                Cancel
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
