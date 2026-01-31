'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { requestorApi, DataAccessRequest, Requestor } from '@/lib/requestor_api'
import { formatDate, getStatusColor } from '@/lib/utils'
import { 
  FileText, 
  CheckCircle, 
  Clock, 
  XCircle, 
  AlertCircle,
  PlusCircle,
  ArrowRight,
  Building2,
  Key
} from 'lucide-react'

export default function RequestorDashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [requestor, setRequestor] = useState<Requestor | null>(null)
  const [requests, setRequests] = useState<DataAccessRequest[]>([])
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    partialApproved: 0,
    activeCredentials: 0,
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      setError('')

      const [profileData, requestsData] = await Promise.all([
        requestorApi.getProfile(),
        requestorApi.getMyRequests({ limit: 100 }),
      ])

      setRequestor(profileData.requestor)
      setRequests(requestsData.requests)

      // Calculate stats
      const allRequests = requestsData.requests
      let activeCredentials = 0

      allRequests.forEach(req => {
        req.responses?.forEach(resp => {
          if (resp.status === 'APPROVED' && resp.access_key_id) {
            // Check if credentials are not expired
            if (resp.cred_expiration) {
              const expiry = new Date(resp.cred_expiration)
              if (expiry > new Date()) {
                activeCredentials++
              }
            } else {
              activeCredentials++
            }
          }
        })
      })

      setStats({
        total: allRequests.length,
        pending: allRequests.filter(r => r.status === 'PENDING' || r.status === 'FORWARDED').length,
        approved: allRequests.filter(r => r.status === 'APPROVED').length,
        rejected: allRequests.filter(r => r.status === 'REJECTED').length,
        partialApproved: allRequests.filter(r => r.status === 'PARTIAL_APPROVED').length,
        activeCredentials,
      })
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  const recentRequests = requests.slice(0, 5)

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md flex items-center gap-2">
        <AlertCircle className="w-4 h-4" />
        <span>{error}</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Welcome back, {requestor?.name?.split(' ')[0] || 'Researcher'}
          </h2>
          <p className="text-muted-foreground">
            Here&apos;s an overview of your data access requests
          </p>
        </div>
        <Button onClick={() => router.push('/requestor/dashboard/requests/new')} className="gap-2">
          <PlusCircle className="w-4 h-4" />
          New Request
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">
              All time data access requests
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pending}</div>
            <p className="text-xs text-muted-foreground">
              Awaiting hospital responses
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.approved + stats.partialApproved}</div>
            <p className="text-xs text-muted-foreground">
              {stats.partialApproved > 0 && `${stats.partialApproved} partially approved`}
              {stats.partialApproved === 0 && 'Fully approved requests'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Credentials</CardTitle>
            <Key className="h-4 w-4 text-indigo-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeCredentials}</div>
            <p className="text-xs text-muted-foreground">
              Valid STS credentials
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Requests */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Requests</CardTitle>
              <CardDescription>Your latest data access requests</CardDescription>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => router.push('/requestor/dashboard/requests')}
              className="gap-2"
            >
              View All
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {recentRequests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No requests yet</p>
              <Button 
                variant="link" 
                onClick={() => router.push('/requestor/dashboard/requests/new')}
                className="mt-2"
              >
                Create your first request
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {recentRequests.map((request) => {
                const approvedCount = request.responses?.filter(r => r.status === 'APPROVED').length || 0
                const totalCount = request.responses?.length || 0
                
                return (
                  <div
                    key={request.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => router.push(`/requestor/dashboard/requests/${request.id}`)}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {request.purpose.length > 50 
                            ? request.purpose.substring(0, 50) + '...' 
                            : request.purpose}
                        </span>
                        <Badge className={getStatusColor(request.status)}>
                          {request.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3 h-3" />
                          {totalCount} hospital(s)
                        </span>
                        <span>
                          {approvedCount}/{totalCount} approved
                        </span>
                        <span>{formatDate(request.created_at)}</span>
                      </div>
                      {request.departments && request.departments.length > 0 && (
                        <div className="flex gap-1 mt-1">
                          {request.departments.slice(0, 3).map((dept) => (
                            <Badge key={dept} variant="outline" className="text-xs">
                              {dept}
                            </Badge>
                          ))}
                          {request.departments.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{request.departments.length - 3}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      {stats.activeCredentials > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>
              You have active credentials - start querying data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => router.push('/requestor/dashboard/query')}
              className="gap-2"
            >
              Open Query Console
              <ArrowRight className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
