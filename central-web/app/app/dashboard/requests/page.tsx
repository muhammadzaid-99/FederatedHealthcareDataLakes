'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { formatDate, getStatusColor } from '@/lib/utils'
import { FileText, AlertCircle, Search, RefreshCw, ChevronRight } from 'lucide-react'

export default function RequestsPage() {
  const router = useRouter()
  const [requests, setRequests] = useState<DataAccessRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    loadRequests()
  }, [])

  const loadRequests = async () => {
    try {
      setError('')
      const data = await api.getDataAccessRequests()
      setRequests(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const filteredRequests = requests.filter(req =>
    (req.requestor_id?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (req.requestor_email?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (req.purpose?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  )

  const getResponseStats = (request: DataAccessRequest) => {
    if (!request.responses || request.responses.length === 0) {
      return { pending: 0, approved: 0, rejected: 0, total: 0 }
    }
    const approved = request.responses.filter(r => r.status === 'APPROVED').length
    const rejected = request.responses.filter(r => r.status === 'REJECTED').length
    const pending = request.responses.filter(r => r.status === 'PENDING').length
    return { pending, approved, rejected, total: request.responses.length }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Data Access Requests</h2>
          <p className="text-muted-foreground">
            View and monitor all data access requests from researchers
          </p>
        </div>
        <Button onClick={loadRequests} className="gap-2" variant="outline">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}

      {/* Search */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search requests..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Requests List */}
      <Card>
        <CardHeader>
          <CardTitle>All Requests</CardTitle>
          <CardDescription>
            {loading ? 'Loading...' : `Showing ${filteredRequests.length} of ${requests.length} request(s)`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-20" />
              <p className="text-lg font-medium mb-2">
                {searchTerm ? 'No matching requests' : 'No data access requests'}
              </p>
              <p className="text-sm text-muted-foreground">
                {searchTerm ? 'Try a different search term' : 'Requests will appear here when researchers submit them'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Requester</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Hospitals</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Responses</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.map((request) => {
                  const stats = getResponseStats(request)
                  return (
                    <TableRow
                      key={request.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/dashboard/requests/${request.id}`)}
                    >
                      <TableCell>
                        <div>
                          <div className="font-medium">{request.requestor_id}</div>
                          <div className="text-sm text-muted-foreground">
                            {request.requestor_email}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <p className="truncate text-sm">{request.purpose}</p>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {request.requested_nodes && request.requested_nodes.slice(0, 2).map((nodeId) => (
                            <Badge key={nodeId} variant="outline" className="text-xs">
                              {nodeId.substring(0, 8)}...
                            </Badge>
                          ))}
                          {request.requested_nodes && request.requested_nodes.length > 2 && (
                            <Badge variant="outline" className="text-xs">
                              +{request.requested_nodes.length - 2}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(request.status)}>
                          {request.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 text-xs">
                          {stats.approved > 0 && (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                              {stats.approved} approved
                            </Badge>
                          )}
                          {stats.rejected > 0 && (
                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                              {stats.rejected} rejected
                            </Badge>
                          )}
                          {stats.pending > 0 && (
                            <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                              {stats.pending} pending
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(request.created_at)}
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
