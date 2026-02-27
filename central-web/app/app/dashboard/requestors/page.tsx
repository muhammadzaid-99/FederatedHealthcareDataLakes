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
import { api, Requestor } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Inbox,
  Users,
  Mail,
  Building,
  CalendarDays,
  RefreshCw,
  Loader2,
  ShieldCheck,
  ShieldX,
  Filter,
} from 'lucide-react'

type ActionType = 'approve' | 'reject'
type FilterType = 'all' | 'PENDING' | 'APPROVED' | 'REJECTED'

interface ConfirmState {
  requestorId: string
  action: ActionType
}

export default function RequestorsPage() {
  const [requestors, setRequestors] = useState<Requestor[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [processingAction, setProcessingAction] = useState<ActionType | null>(null)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [filter, setFilter] = useState<FilterType>('all')

  const loadRequestors = useCallback(async (isRefresh = false) => {
    try {
      setError('')
      if (isRefresh) setRefreshing(true)
      const data = filter === 'all'
        ? await api.getAllRequestors()
        : await api.getAllRequestors(filter)
      setRequestors(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [filter])

  useEffect(() => {
    loadRequestors()
  }, [loadRequestors])

  const handleAction = async (requestorId: string, action: ActionType) => {
    if (!confirm || confirm.requestorId !== requestorId || confirm.action !== action) {
      setConfirm({ requestorId, action })
      return
    }

    setConfirm(null)
    setProcessingId(requestorId)
    setProcessingAction(action)
    try {
      if (action === 'approve') {
        await api.approveRequestor(requestorId)
      } else {
        await api.rejectRequestor(requestorId)
      }
      await loadRequestors()
    } catch (err: any) {
      setError(`Failed to ${action} requestor: ${err.message}`)
    } finally {
      setProcessingId(null)
      setProcessingAction(null)
    }
  }

  const cancelConfirm = () => setConfirm(null)
  const isProcessing = (id: string) => processingId === id
  const isConfirming = (id: string, action: ActionType) =>
    confirm?.requestorId === id && confirm?.action === action

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return (
          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800 gap-1">
            <CheckCircle className="h-3 w-3" />
            Approved
          </Badge>
        )
      case 'REJECTED':
        return (
          <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800 gap-1">
            <XCircle className="h-3 w-3" />
            Rejected
          </Badge>
        )
      case 'PENDING':
      default:
        return (
          <Badge className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800 gap-1">
            <Clock className="h-3 w-3" />
            Pending
          </Badge>
        )
    }
  }

  const pendingCount = requestors.filter(r => r.status === 'PENDING').length

  // Loading skeleton
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
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Requestor Management
          </h2>
          <p className="text-slate-500 dark:text-slate-400">
            Review and manage data requestor registrations
          </p>
        </div>

        <div className="flex items-center gap-3">
          {pendingCount > 0 && (
            <Badge
              variant="secondary"
              className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 px-3 py-1 text-sm font-medium"
            >
              {pendingCount} pending
            </Badge>
          )}
          <Badge
            variant="secondary"
            className="bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 px-3 py-1 text-sm font-medium"
          >
            {requestors.length} total
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadRequestors(true)}
            disabled={refreshing}
            className="gap-1.5 border-slate-300 dark:border-slate-700"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {([
          { value: 'all', label: 'All' },
          { value: 'PENDING', label: 'Pending' },
          { value: 'APPROVED', label: 'Approved' },
          { value: 'REJECTED', label: 'Rejected' },
        ] as { value: FilterType; label: string }[]).map((f) => (
          <Button
            key={f.value}
            variant={filter === f.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(f.value)}
            className={filter === f.value
              ? 'bg-violet-600 hover:bg-violet-700 text-white'
              : 'border-slate-300 dark:border-slate-700'}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* Error banner */}
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

      {/* Empty state */}
      {requestors.length === 0 ? (
        <Card className="border-dashed border-2 border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <CardContent className="flex flex-col items-center justify-center py-20">
            <div className="rounded-full bg-slate-100 p-4 dark:bg-slate-800 mb-5">
              <Inbox className="h-10 w-10 text-slate-400 dark:text-slate-500" />
            </div>
            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {filter === 'all' ? 'No requestors yet' : `No ${filter.toLowerCase()} requestors`}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm text-center">
              {filter === 'all'
                ? 'No requestors have registered yet. New registrations will appear here.'
                : `No requestors with ${filter.toLowerCase()} status found.`}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadRequestors(true)}
              className="mt-6 gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Check again
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Card grid (small/medium screens) */}
          <div className="grid gap-4 md:grid-cols-2 xl:hidden">
            {requestors.map((requestor) => {
              const processing = isProcessing(requestor.id)
              const confirmApprove = isConfirming(requestor.id, 'approve')
              const confirmReject = isConfirming(requestor.id, 'reject')
              const isPending = requestor.status === 'PENDING'

              return (
                <Card
                  key={requestor.id}
                  className={`relative overflow-hidden border-slate-200 dark:border-slate-800 transition-shadow hover:shadow-md ${
                    processing ? 'opacity-70 pointer-events-none' : ''
                  }`}
                >
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-500 to-indigo-500" />

                  <CardHeader className="pb-2 pt-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/40">
                          <Users className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                        </div>
                        <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100 leading-tight">
                          {requestor.name}
                        </CardTitle>
                      </div>
                      {getStatusBadge(requestor.status)}
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4 pt-2">
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                        <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="truncate">{requestor.email}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                        <Building className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="truncate">{requestor.organization || 'N/A'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                        <CalendarDays className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span>{formatDate(requestor.created_at)}</span>
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

                    {isPending && (
                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          onClick={() => handleAction(requestor.id, 'approve')}
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
                          onClick={() => handleAction(requestor.id, 'reject')}
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
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Table (xl screens) */}
          <Card className="hidden xl:block border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 dark:bg-slate-900/50 hover:bg-slate-50/80">
                    <TableHead className="font-semibold text-slate-600 dark:text-slate-400">Name</TableHead>
                    <TableHead className="font-semibold text-slate-600 dark:text-slate-400">Email</TableHead>
                    <TableHead className="font-semibold text-slate-600 dark:text-slate-400">Organization</TableHead>
                    <TableHead className="font-semibold text-slate-600 dark:text-slate-400">Registered</TableHead>
                    <TableHead className="font-semibold text-slate-600 dark:text-slate-400">Status</TableHead>
                    <TableHead className="font-semibold text-slate-600 dark:text-slate-400 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requestors.map((requestor) => {
                    const processing = isProcessing(requestor.id)
                    const confirmApprove = isConfirming(requestor.id, 'approve')
                    const confirmReject = isConfirming(requestor.id, 'reject')
                    const isPending = requestor.status === 'PENDING'

                    return (
                      <TableRow
                        key={requestor.id}
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
                              <Users className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                            </div>
                            <span className="font-semibold text-slate-900 dark:text-slate-100">
                              {requestor.name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-slate-600 dark:text-slate-400">
                          {requestor.email}
                        </TableCell>
                        <TableCell className="text-slate-600 dark:text-slate-400">
                          {requestor.organization || 'N/A'}
                        </TableCell>
                        <TableCell className="text-slate-600 dark:text-slate-400">
                          {formatDate(requestor.created_at)}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(requestor.status)}
                        </TableCell>
                        <TableCell className="text-right">
                          {isPending ? (
                            <div className="flex items-center justify-end gap-2">
                              {(confirmApprove || confirmReject) && (
                                <span className="text-xs text-slate-500 mr-1">
                                  Click again to confirm
                                </span>
                              )}
                              <Button
                                size="sm"
                                onClick={() => handleAction(requestor.id, 'approve')}
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
                                onClick={() => handleAction(requestor.id, 'reject')}
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
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
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
