'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { api, DataAccessRequest } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import {
  FileText,
  AlertCircle,
  Search,
  RefreshCw,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  Inbox,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Status badge styling                                               */
/* ------------------------------------------------------------------ */
function statusConfig(status: string) {
  switch (status.toUpperCase()) {
    case 'PENDING':
      return {
        label: 'Pending',
        dot: 'bg-amber-400',
        bg: 'bg-amber-50 border-amber-200/60 text-amber-700 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300',
      }
    case 'APPROVED':
      return {
        label: 'Approved',
        dot: 'bg-emerald-400',
        bg: 'bg-emerald-50 border-emerald-200/60 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300',
      }
    case 'REJECTED':
      return {
        label: 'Rejected',
        dot: 'bg-rose-400',
        bg: 'bg-rose-50 border-rose-200/60 text-rose-700 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300',
      }
    case 'COMPLETED':
      return {
        label: 'Completed',
        dot: 'bg-violet-400',
        bg: 'bg-violet-50 border-violet-200/60 text-violet-700 dark:bg-violet-950/40 dark:border-violet-800 dark:text-violet-300',
      }
    case 'PROCESSING':
      return {
        label: 'Processing',
        dot: 'bg-indigo-400',
        bg: 'bg-indigo-50 border-indigo-200/60 text-indigo-700 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-300',
      }
    default:
      return {
        label: status,
        dot: 'bg-slate-400',
        bg: 'bg-slate-50 border-slate-200/60 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300',
      }
  }
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
export default function RequestsPage() {
  const router = useRouter()
  const [requests, setRequests] = useState<DataAccessRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  const loadRequests = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true)
      setError('')
      const data = await api.getDataAccessRequests()
      setRequests(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadRequests()
  }, [loadRequests])

  /* ---- search filter ---- */
  const q = searchTerm.toLowerCase()
  const filteredRequests = requests.filter(
    (req) =>
      (req.requestor_id?.toLowerCase() ?? '').includes(q) ||
      (req.requestor_email?.toLowerCase() ?? '').includes(q) ||
      (req.purpose?.toLowerCase() ?? '').includes(q) ||
      (req.status?.toLowerCase() ?? '').includes(q)
  )

  /* ---- response stats helper ---- */
  const getResponseStats = (request: DataAccessRequest) => {
    const responses = request.responses ?? []
    if (responses.length === 0) return { pending: 0, approved: 0, rejected: 0, total: 0 }
    return {
      approved: responses.filter((r) => r.status === 'APPROVED').length,
      rejected: responses.filter((r) => r.status === 'REJECTED').length,
      pending: responses.filter((r) => r.status === 'PENDING').length,
      total: responses.length,
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */
  return (
    <div className="space-y-8">
      {/* ---- Header ---- */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
            Data Access Requests
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Monitor and review incoming data access requests from researchers.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => loadRequests(true)}
          disabled={refreshing}
          className="gap-2 border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* ---- Error banner ---- */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ---- Search bar ---- */}
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          placeholder="Search by name, email, purpose or status…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="h-10 rounded-lg border-slate-200 bg-white pl-10 text-sm shadow-sm placeholder:text-slate-400 focus-visible:ring-violet-500 dark:border-slate-700 dark:bg-slate-900"
        />
      </div>

      {/* ---- Main card ---- */}
      <Card className="overflow-hidden border-slate-200 shadow-sm dark:border-slate-800">
        <CardHeader className="border-b border-slate-100 bg-slate-50/60 px-6 py-4 dark:border-slate-800 dark:bg-slate-900/50">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-slate-800 dark:text-slate-200">
              All Requests
            </CardTitle>
            {!loading && (
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {filteredRequests.length} of {requests.length} request{requests.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {/* Loading state */}
          {loading ? (
            <div className="space-y-px divide-y divide-slate-100 dark:divide-slate-800">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-6 py-4">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                  <Skeleton className="h-6 w-20 rounded-full" />
                  <Skeleton className="h-4 w-4 rounded" />
                </div>
              ))}
            </div>
          ) : filteredRequests.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                <Inbox className="h-7 w-7 text-slate-400 dark:text-slate-500" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-700 dark:text-slate-300">
                {searchTerm ? 'No matching requests' : 'No requests yet'}
              </h3>
              <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
                {searchTerm
                  ? 'Try adjusting your search query or clearing the filter.'
                  : 'Requests from researchers will appear here once submitted.'}
              </p>
            </div>
          ) : (
            /* Table */
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-slate-100 bg-slate-50/40 hover:bg-slate-50/40 dark:border-slate-800 dark:bg-slate-900/30">
                    <TableHead className="pl-6 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Requester
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Purpose
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Hospitals
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Status
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Responses
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Created
                    </TableHead>
                    <TableHead className="w-10 pr-6" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRequests.map((request) => {
                    const stats = getResponseStats(request)
                    const sc = statusConfig(request.status)

                    return (
                      <TableRow
                        key={request.id}
                        onClick={() => router.push(`/dashboard/requests/${request.id}`)}
                        className="group cursor-pointer border-b border-slate-100 transition-colors hover:bg-violet-50/40 dark:border-slate-800 dark:hover:bg-violet-950/20"
                      >
                        {/* Requester */}
                        <TableCell className="pl-6">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-xs font-bold text-white shadow-sm">
                              {(request.requestor_id?.[0] ?? '?').toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">
                                {request.requestor_id}
                              </p>
                              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                {request.requestor_email}
                              </p>
                            </div>
                          </div>
                        </TableCell>

                        {/* Purpose */}
                        <TableCell className="max-w-[220px]">
                          <p className="truncate text-sm text-slate-600 dark:text-slate-300">
                            {request.purpose}
                          </p>
                        </TableCell>

                        {/* Hospitals (node pills) */}
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {request.requested_nodes?.slice(0, 2).map((nodeId) => (
                              <span
                                key={nodeId}
                                className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700"
                              >
                                {nodeId.length > 10 ? `${nodeId.substring(0, 8)}…` : nodeId}
                              </span>
                            ))}
                            {(request.requested_nodes?.length ?? 0) > 2 && (
                              <span className="inline-flex items-center rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-600 ring-1 ring-inset ring-violet-200 dark:bg-violet-950/40 dark:text-violet-400 dark:ring-violet-800">
                                +{request.requested_nodes!.length - 2}
                              </span>
                            )}
                          </div>
                        </TableCell>

                        {/* Status */}
                        <TableCell>
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${sc.bg}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                            {sc.label}
                          </span>
                        </TableCell>

                        {/* Responses */}
                        <TableCell>
                          {stats.total === 0 ? (
                            <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              {stats.approved > 0 && (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  {stats.approved}
                                </span>
                              )}
                              {stats.rejected > 0 && (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-400">
                                  <XCircle className="h-3.5 w-3.5" />
                                  {stats.rejected}
                                </span>
                              )}
                              {stats.pending > 0 && (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                                  <Clock className="h-3.5 w-3.5" />
                                  {stats.pending}
                                </span>
                              )}
                            </div>
                          )}
                        </TableCell>

                        {/* Created */}
                        <TableCell className="whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                          {formatDate(request.created_at)}
                        </TableCell>

                        {/* Arrow */}
                        <TableCell className="pr-6">
                          <ChevronRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-violet-500 dark:text-slate-600 dark:group-hover:text-violet-400" />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
