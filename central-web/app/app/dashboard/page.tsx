'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { api, Hospital, DataAccessRequest } from '@/lib/api'
import { Users, Building2, FileText, Clock, CheckCircle, XCircle } from 'lucide-react'

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalHospitals: 0,
    pendingRegistrations: 0,
    totalRequests: 0,
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

      setStats({
        totalHospitals: hospitals.filter((h: Hospital) => h.status === 'approved').length,
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
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      title: 'Pending Registrations',
      value: stats.pendingRegistrations,
      icon: Clock,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-100',
    },
    {
      title: 'Total Requests',
      value: stats.totalRequests,
      icon: FileText,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      title: 'Active Users',
      value: stats.totalHospitals,
      icon: Users,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard Overview</h2>
        <p className="text-muted-foreground">
          Welcome to the Central Control Plane admin dashboard
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                <div className={`${stat.bgColor} p-2 rounded-lg`}>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold">{stat.value}</div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Recent Requests */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Data Access Requests</CardTitle>
          <CardDescription>Latest requests from the system</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : stats.recentRequests.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>No data access requests yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {stats.recentRequests.map((request) => (
                <div
                  key={request.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{request.requestor_id}</h4>
                      <span className="text-xs text-muted-foreground">
                        {request.requestor_email}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{request.purpose}</p>
                    <div className="flex gap-2 mt-2">
                      {request.requested_nodes && request.requested_nodes.slice(0, 3).map((nodeId) => (
                        <span
                          key={nodeId}
                          className="text-xs bg-gray-100 px-2 py-1 rounded"
                        >
                          Hospital: {nodeId.substring(0, 8)}...
                        </span>
                      ))}
                      {request.requested_nodes && request.requested_nodes.length > 3 && (
                        <span className="text-xs text-muted-foreground">
                          +{request.requested_nodes.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {request.status === 'completed' ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : request.status === 'rejected' ? (
                      <XCircle className="w-5 h-5 text-red-600" />
                    ) : (
                      <Clock className="w-5 h-5 text-yellow-600" />
                    )}
                    <span className="text-sm font-medium capitalize">{request.status}</span>
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
