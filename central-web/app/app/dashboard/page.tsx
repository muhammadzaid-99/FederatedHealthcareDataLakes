'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { api, Hospital, DataAccessRequest } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import {
  Building2,
  Clock,
  FileText,
  Users,
  CheckCircle,
  XCircle,
  ArrowRight,
  TrendingUp,
} from 'lucide-react'

export default function DashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalHospitals: 0,
    pendingRegistrations: 0,
    totalRequests: 0,
    activeHospitals: 0,
    recentRequests: [] as DataAccessRequest[],
  })

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    try {
      const [hospitals, pending, requests] = await Promise.all([
        api.getAllHospitals(),
        api.getPendingRegistrations(),
        api.getDataAccessRequests(),
      ])

      const approved = hospitals.filter((h: Hospital) => h.status === 'approved' || h.status === 'CREDENTIALS_ISSUED' || h.status === 'ACTIVE')

      setStats({
        totalHospitals: hospitals.length,
        activeHospitals: approved.length,
        pendingRegistrations: pending.length,
        totalRequests: requests.length,
        recentRequests: requests.slice(0, 5),
      })
    } catch (error) {
      console.error('Failed to load stats:', error)
    } finally {
      setLoading(false)
    }
  }

  const statCards = [
    {
      title: 'Total Hospitals',
      value: stats.totalHospitals,
      icon: Building2,
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      subtitle: `${stats.activeHospitals} active`,
    },
    {
      title: 'Pending Approvals',
      value: stats.pendingRegistrations,
      icon: Clock,
      iconBg: 'bg-amber-100',
      iconColor: 'text-amber-600',
      subtitle: 'Awaiting review',
    },
    {
      title: 'Data Requests',
      value: stats.totalRequests,
      icon: FileText,
      iconBg: 'bg-violet-100',
      iconColor: 'text-violet-600',
      subtitle: 'Total requests',
    },
    {
      title: 'Active Nodes',
      value: stats.activeHospitals,
      icon: TrendingUp,
      iconBg: 'bg-emerald-100',
      iconColor: 'text-emerald-600',
      subtitle: 'Connected nodes',
    },
  ]

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100">Completed</Badge>
      case 'rejected':
        return <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100">Rejected</Badge>
      case 'pending':
      case 'pending_responses':
        return <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">Pending</Badge>
      case 'processing':
        return <Badge className="bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100">Processing</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="space-y-8">
      {/* Stats Grid */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.title} className="border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-slate-500">{stat.title}</p>
                    {loading ? (
                      <Skeleton className="h-8 w-16" />
                    ) : (
                      <p className="text-3xl font-bold text-slate-900">{stat.value}</p>
                    )}
                    <p className="text-xs text-slate-400">{stat.subtitle}</p>
                  </div>
                  <div className={`${stat.iconBg} p-2.5 rounded-xl`}>
                    <Icon className={`h-5 w-5 ${stat.iconColor}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Quick Links */}
      <div className="grid gap-4 sm:grid-cols-3">
        <button
          onClick={() => router.push('/dashboard/pending')}
          className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 text-left hover:shadow-md hover:border-violet-200 transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-100 p-2">
              <Clock className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <p className="font-medium text-slate-900">Pending Approvals</p>
              <p className="text-xs text-slate-500">{stats.pendingRegistrations} hospitals waiting</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-violet-500 transition-colors" />
        </button>
        <button
          onClick={() => router.push('/dashboard/hospitals')}
          className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 text-left hover:shadow-md hover:border-violet-200 transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2">
              <Building2 className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-slate-900">All Hospitals</p>
              <p className="text-xs text-slate-500">{stats.totalHospitals} registered</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-violet-500 transition-colors" />
        </button>
        <button
          onClick={() => router.push('/dashboard/requests')}
          className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 text-left hover:shadow-md hover:border-violet-200 transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-violet-100 p-2">
              <FileText className="h-4 w-4 text-violet-600" />
            </div>
            <div>
              <p className="font-medium text-slate-900">Data Requests</p>
              <p className="text-xs text-slate-500">{stats.totalRequests} total requests</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-violet-500 transition-colors" />
        </button>
      </div>

      {/* Recent Requests */}
      <Card className="border border-slate-200 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-slate-900">Recent Data Access Requests</CardTitle>
              <p className="text-sm text-slate-500 mt-1">Latest activity across the system</p>
            </div>
            <button
              onClick={() => router.push('/dashboard/requests')}
              className="text-sm text-violet-600 hover:text-violet-700 font-medium flex items-center gap-1"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : stats.recentRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-xl bg-slate-100 p-4 mb-4">
                <FileText className="h-8 w-8 text-slate-400" />
              </div>
              <p className="font-medium text-slate-600">No data access requests yet</p>
              <p className="text-sm text-slate-400 mt-1">Requests will appear here once created</p>
            </div>
          ) : (
            <div className="space-y-3">
              {stats.recentRequests.map((request) => (
                <div
                  key={request.id}
                  onClick={() => router.push(`/dashboard/requests/${request.id}`)}
                  className="group flex items-center justify-between rounded-xl border border-slate-200 p-4 hover:bg-slate-50 hover:border-violet-200 cursor-pointer transition-all"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium text-slate-900 truncate">{request.requestor_id || 'Unknown'}</p>
                      {request.requestor_email && (
                        <span className="text-xs text-slate-400 truncate">{request.requestor_email}</span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 truncate">{request.purpose}</p>
                    <div className="flex gap-1.5 mt-2">
                      {request.requested_nodes?.slice(0, 2).map((nodeId) => (
                        <span
                          key={nodeId}
                          className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full"
                        >
                          {nodeId.substring(0, 8)}...
                        </span>
                      ))}
                      {request.requested_nodes && request.requested_nodes.length > 2 && (
                        <span className="text-[11px] text-slate-400">+{request.requested_nodes.length - 2} more</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-4 shrink-0">
                    {getStatusBadge(request.status)}
                    <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-violet-500 transition-colors" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
