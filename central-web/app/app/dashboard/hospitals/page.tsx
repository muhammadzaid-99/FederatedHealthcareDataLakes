'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { api, Hospital } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import {
  Building2,
  CheckCircle2,
  Clock4,
  AlertCircle,
  Search,
  Activity,
  ShieldCheck,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Status helpers                                                     */
/* ------------------------------------------------------------------ */

const STATUS_CONFIG: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  ACTIVE:              { label: 'Active',             dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  CREDENTIALS_ISSUED:  { label: 'Credentials Issued', dot: 'bg-violet-500', bg: 'bg-violet-50',  text: 'text-violet-700' },
  PENDING:             { label: 'Pending',            dot: 'bg-amber-500',  bg: 'bg-amber-50',   text: 'text-amber-700' },
  APPROVED:            { label: 'Approved',           dot: 'bg-sky-500',    bg: 'bg-sky-50',     text: 'text-sky-700' },
}

function statusBadge(status: string) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, dot: 'bg-slate-400', bg: 'bg-slate-100', text: 'text-slate-600' }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  Stat card                                                          */
/* ------------------------------------------------------------------ */

function StatCard({
  icon,
  label,
  value,
  accent,
  loading,
}: {
  icon: React.ReactNode
  label: string
  value: number
  accent: string
  loading: boolean
}) {
  return (
    <Card className="relative overflow-hidden border-slate-200/80 shadow-sm">
      <CardHeader className="flex flex-row items-center gap-3 pb-2">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${accent}`}>
          {icon}
        </div>
        <CardTitle className="text-sm font-medium text-slate-500">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-9 w-14 rounded-md" />
        ) : (
          <p className="text-3xl font-bold tracking-tight text-slate-900">{value}</p>
        )}
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function HospitalsPage() {
  const [hospitals, setHospitals] = useState<Hospital[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadHospitals()
  }, [])

  const loadHospitals = async () => {
    try {
      setError('')
      const data = await api.getAllHospitals()
      // Only show approved hospitals (CREDENTIALS_ISSUED and ACTIVE)
      const approvedHospitals = data.filter(
        (h: Hospital) => h.status === 'CREDENTIALS_ISSUED' || h.status === 'ACTIVE'
      )
      setHospitals(approvedHospitals)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  /* derived counts */
  const activeCount = hospitals.filter((h) => h.status === 'ACTIVE').length
  const credIssuedCount = hospitals.filter((h) => h.status === 'CREDENTIALS_ISSUED').length

  /* search filter */
  const filtered = useMemo(() => {
    if (!search.trim()) return hospitals
    const q = search.toLowerCase()
    return hospitals.filter(
      (h) =>
        h.name.toLowerCase().includes(q) ||
        h.email.toLowerCase().includes(q) ||
        h.status.toLowerCase().includes(q) ||
        (h.nessie_namespace ?? '').toLowerCase().includes(q)
    )
  }, [hospitals, search])

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-1">
      {/* ---- Header ---- */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Hospitals</h1>
        <p className="mt-1 text-sm text-slate-500">
          Overview of all credentialed &amp; active hospitals in the network.
        </p>
      </div>

      {/* ---- Error banner ---- */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ---- Stat cards ---- */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={<Building2 className="h-5 w-5 text-indigo-600" />}
          label="Total Hospitals"
          value={hospitals.length}
          accent="bg-indigo-100"
          loading={loading}
        />
        <StatCard
          icon={<Activity className="h-5 w-5 text-emerald-600" />}
          label="Active"
          value={activeCount}
          accent="bg-emerald-100"
          loading={loading}
        />
        <StatCard
          icon={<ShieldCheck className="h-5 w-5 text-violet-600" />}
          label="Credentials Issued"
          value={credIssuedCount}
          accent="bg-violet-100"
          loading={loading}
        />
      </div>

      {/* ---- Table card ---- */}
      <Card className="border-slate-200/80 shadow-sm">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg font-semibold text-slate-800">
              Registered Hospitals
            </CardTitle>
            <p className="mt-0.5 text-sm text-slate-500">
              {loading ? 'Loading\u2026' : `${filtered.length} of ${hospitals.length} hospital(s)`}
            </p>
          </div>

          {/* search */}
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search by name, email, namespace\u2026"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-sm"
            />
          </div>
        </CardHeader>

        <CardContent className="px-0 pb-0">
          {loading ? (
            <div className="space-y-2 px-6 pb-6">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-md" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Building2 className="mb-3 h-12 w-12 text-slate-300" />
              <p className="text-base font-medium text-slate-600">
                {hospitals.length === 0 ? 'No hospitals registered yet' : 'No results found'}
              </p>
              <p className="mt-1 text-sm text-slate-400">
                {hospitals.length === 0
                  ? 'Waiting for hospitals to join the network.'
                  : 'Try adjusting your search query.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/60 hover:bg-slate-50/60">
                    <TableHead className="pl-6 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Hospital
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Email
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Status
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Client ID
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Namespace
                    </TableHead>
                    <TableHead className="pr-6 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Registered
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((hospital) => (
                    <TableRow
                      key={hospital.id}
                      className="group transition-colors hover:bg-slate-50/80"
                    >
                      {/* Name */}
                      <TableCell className="pl-6 font-medium text-slate-800">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-indigo-100 text-xs font-bold text-indigo-600">
                            {hospital.name.charAt(0).toUpperCase()}
                          </span>
                          <span className="max-w-[180px] truncate">{hospital.name}</span>
                        </div>
                      </TableCell>

                      {/* Email */}
                      <TableCell className="max-w-[200px] truncate text-sm text-slate-600">
                        {hospital.email}
                      </TableCell>

                      {/* Status */}
                      <TableCell>{statusBadge(hospital.status)}</TableCell>

                      {/* Client ID */}
                      <TableCell>
                        {hospital.client_id ? (
                          <code className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">
                            {hospital.client_id.substring(0, 16)}&hellip;
                          </code>
                        ) : (
                          <span className="text-slate-400">&mdash;</span>
                        )}
                      </TableCell>

                      {/* Namespace */}
                      <TableCell>
                        {hospital.nessie_namespace ? (
                          <code className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">
                            {hospital.nessie_namespace}
                          </code>
                        ) : (
                          <span className="text-slate-400">&mdash;</span>
                        )}
                      </TableCell>

                      {/* Date */}
                      <TableCell className="pr-6 text-sm text-slate-500 whitespace-nowrap">
                        {formatDate(hospital.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
