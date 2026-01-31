'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { requestorApi, DataAccessRequest } from '@/lib/requestor_api'
import { formatDate, getStatusColor } from '@/lib/utils'
import { 
  FileText, 
  AlertCircle, 
  PlusCircle,
  Building2,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
  ChevronRight
} from 'lucide-react'

export default function RequestorRequestsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [requests, setRequests] = useState<DataAccessRequest[]>([])
  const [total, setTotal] = useState(0)
  const [statusFilter, setStatusFilter] = useState<string>('all')

  useEffect(() => {
    loadRequests()
  }, [statusFilter])

  const loadRequests = async () => {
    try {
      setLoading(true)
      setError('')

      const params: { status?: string; limit?: number } = { limit: 50 }
      if (statusFilter !== 'all') {
        params.status = statusFilter
      }

      const data = await requestorApi.getMyRequests(params)
      setRequests(data.requests)
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message || 'Failed to load requests')
    } finally {
      setLoading(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return <CheckCircle className="w-4 h-4 text-green-600" />
      case 'REJECTED':
        return <XCircle className="w-4 h-4 text-red-600" />
      case 'PARTIAL_APPROVED':
        return <CheckCircle className="w-4 h-4 text-yellow-600" />
      default:
        return <Clock className="w-4 h-4 text-blue-600" />
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">My Requests</h2>
          <p className="text-muted-foreground">
            View and manage your data access requests
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadRequests} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
          <Button onClick={() => router.push('/requestor/dashboard/requests/new')} className="gap-2">
            <PlusCircle className="w-4 h-4" />
            New Request
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Status:</span>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="FORWARDED">Forwarded</SelectItem>
                  <SelectItem value="PARTIAL_APPROVED">Partial Approved</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <span className="text-sm text-muted-foreground">
              Showing {requests.length} of {total} requests
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      )}

      {/* Requests List */}
      {!loading && requests.length === 0 && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">No requests found</p>
              <p className="text-sm mt-1">
                {statusFilter !== 'all' 
                  ? 'Try changing the filter or create a new request'
                  : 'Create your first data access request'}
              </p>
              <Button 
                onClick={() => router.push('/requestor/dashboard/requests/new')}
                className="mt-4 gap-2"
              >
                <PlusCircle className="w-4 h-4" />
                New Request
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && requests.length > 0 && (
        <div className="space-y-4">
          {requests.map((request) => {
            const approvedCount = request.responses?.filter(r => r.status === 'APPROVED').length || 0
            const rejectedCount = request.responses?.filter(r => r.status === 'REJECTED').length || 0
            const pendingCount = request.responses?.filter(r => r.status === 'PENDING').length || 0
            const totalCount = request.responses?.length || 0
            const hasCredentials = request.responses?.some(r => r.status === 'APPROVED' && r.access_key_id)

            return (
              <Card
                key={request.id}
                className="hover:border-indigo-200 cursor-pointer transition-colors"
                onClick={() => router.push(`/requestor/dashboard/requests/${request.id}`)}
              >
                <CardContent className="py-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-3">
                        {getStatusIcon(request.status)}
                        <span className="font-medium">{request.purpose}</span>
                        <Badge className={getStatusColor(request.status)}>
                          {request.status.replace('_', ' ')}
                        </Badge>
                        {hasCredentials && (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                            Has Credentials
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3 h-3" />
                          {totalCount} hospital(s)
                        </span>
                        <span className="text-green-600">{approvedCount} approved</span>
                        <span className="text-red-600">{rejectedCount} rejected</span>
                        <span className="text-yellow-600">{pendingCount} pending</span>
                      </div>

                      {request.departments && request.departments.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {request.departments.map((dept) => (
                            <Badge key={dept} variant="secondary" className="text-xs">
                              {dept}
                            </Badge>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>Created: {formatDate(request.created_at)}</span>
                        <span>Expires: {formatDate(request.expires_at)}</span>
                        <span className="font-mono text-xs">ID: {request.id.substring(0, 8)}...</span>
                      </div>
                    </div>

                    <ChevronRight className="w-5 h-5 text-muted-foreground mt-1" />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
