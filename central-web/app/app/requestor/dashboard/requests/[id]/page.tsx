'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { requestorApi, DataAccessRequest, NodeAccessResponse } from '@/lib/requestor_api'
import { formatDate, getStatusColor } from '@/lib/utils'
import { 
  ArrowLeft, 
  AlertCircle, 
  RefreshCw, 
  Building2, 
  CheckCircle, 
  XCircle, 
  Clock,
  Key,
  Shield,
  Calendar,
  Copy,
  ChevronDown,
  ChevronUp,
  Terminal
} from 'lucide-react'

export default function RequestorRequestDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const requestId = params.id as string

  const [request, setRequest] = useState<DataAccessRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedResponses, setExpandedResponses] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    if (requestId) {
      loadRequest()
    }
  }, [requestId])

  const loadRequest = async () => {
    try {
      setLoading(true)
      setError('')
      const data = await requestorApi.getRequestById(requestId)
      setRequest(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const toggleResponse = (responseId: string) => {
    setExpandedResponses(prev => {
      const newSet = new Set(prev)
      if (newSet.has(responseId)) {
        newSet.delete(responseId)
      } else {
        newSet.add(responseId)
      }
      return newSet
    })
  }

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(field)
    setTimeout(() => setCopied(null), 2000)
  }

  const getResponseStatusIcon = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return <CheckCircle className="h-5 w-5 text-green-600" />
      case 'REJECTED':
        return <XCircle className="h-5 w-5 text-red-600" />
      default:
        return <Clock className="h-5 w-5 text-yellow-600" />
    }
  }

  const getResponseStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Approved</Badge>
      case 'REJECTED':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Rejected</Badge>
      default:
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Pending</Badge>
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => router.back()} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back to Requests
        </Button>
        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      </div>
    )
  }

  if (!request) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => router.back()} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back to Requests
        </Button>
        <div className="text-center py-12">
          <p className="text-lg font-medium">Request not found</p>
        </div>
      </div>
    )
  }

  const hasActiveCredentials = request.responses?.some(
    r => r.status === 'APPROVED' && r.access_key_id
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.back()} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Request Details</h2>
            <p className="text-sm text-muted-foreground">ID: {request.id}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {hasActiveCredentials && (
            <Button 
              onClick={() => router.push('/requestor/dashboard/query')}
              className="gap-2"
            >
              <Terminal className="w-4 h-4" />
              Query Data
            </Button>
          )}
          <Button variant="outline" onClick={loadRequest} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Request Overview */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Request Overview</CardTitle>
            <Badge className={getStatusColor(request.status)}>{request.status.replace('_', ' ')}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Purpose</p>
              <p className="text-sm">{request.purpose}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Created</p>
              <p className="text-sm">{formatDate(request.created_at)}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Expires</p>
              <p className="text-sm">{formatDate(request.expires_at)}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Hospitals</p>
              <p className="text-sm">{request.requested_nodes?.length || 0} requested</p>
            </div>
          </div>

          <Separator />

          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Requested Departments</p>
            <div className="flex flex-wrap gap-2">
              {request.departments?.map((dept) => (
                <Badge key={dept} variant="secondary">
                  {dept}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hospital Responses */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Hospital Responses
          </CardTitle>
          <CardDescription>
            {request.responses?.length || 0} hospital(s) have been contacted
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!request.responses || request.responses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Waiting for hospital responses...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {request.responses.map((response: NodeAccessResponse) => (
                <div
                  key={response.id}
                  className="border rounded-lg overflow-hidden"
                >
                  {/* Response Header - Always Visible */}
                  <div
                    className="flex items-center justify-between p-4 bg-muted/30 cursor-pointer hover:bg-muted/50"
                    onClick={() => toggleResponse(response.id)}
                  >
                    <div className="flex items-center gap-3">
                      {getResponseStatusIcon(response.status)}
                      <div>
                        <p className="font-medium">
                          {response.hospital?.name || `Hospital ${response.hospital_id.substring(0, 8)}...`}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {response.hospital?.admin_email || response.hospital_id}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {getResponseStatusBadge(response.status)}
                      {response.responded_at && (
                        <span className="text-xs text-muted-foreground">
                          {formatDate(response.responded_at)}
                        </span>
                      )}
                      {response.status === 'APPROVED' && response.access_key_id && (
                        expandedResponses.has(response.id) 
                          ? <ChevronUp className="h-4 w-4" />
                          : <ChevronDown className="h-4 w-4" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Content - Credentials */}
                  {expandedResponses.has(response.id) && response.status === 'APPROVED' && (
                    <div className="p-4 border-t bg-background space-y-4">
                      {/* Date Range */}
                      {response.date_range_start && response.date_range_end && (
                        <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
                          <Calendar className="h-4 w-4 text-blue-600" />
                          <span className="text-sm font-medium text-blue-900">
                            Data Access Period: {response.date_range_start} to {response.date_range_end}
                          </span>
                        </div>
                      )}

                      {/* Notes */}
                      {response.notes && (
                        <div className="p-3 bg-muted rounded-lg">
                          <p className="text-sm font-medium mb-1">Notes</p>
                          <p className="text-sm text-muted-foreground">{response.notes}</p>
                        </div>
                      )}

                      {/* Departments */}
                      {response.departments && response.departments.length > 0 && (
                        <div className="p-3 bg-muted rounded-lg">
                          <p className="text-sm font-medium mb-1">Approved Departments</p>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {response.departments.map((dept) => (
                              <Badge key={dept} variant="secondary" className="text-xs">
                                {dept}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Credentials Section */}
                      {response.access_key_id && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Key className="h-4 w-4 text-green-600" />
                            <span className="font-medium">Temporary Credentials</span>
                          </div>

                          <div className="grid gap-3">
                            <div>
                              <label className="text-xs font-medium text-muted-foreground uppercase">
                                Access Key ID
                              </label>
                              <div className="flex items-center mt-1">
                                <code className="flex-1 p-2 bg-muted rounded text-sm font-mono break-all">
                                  {response.access_key_id}
                                </code>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    copyToClipboard(response.access_key_id!, `${response.id}-access`)
                                  }}
                                >
                                  <Copy className={`h-4 w-4 ${copied === `${response.id}-access` ? 'text-green-600' : ''}`} />
                                </Button>
                              </div>
                            </div>

                            <div>
                              <label className="text-xs font-medium text-muted-foreground uppercase">
                                Secret Access Key
                              </label>
                              <div className="flex items-center mt-1">
                                <code className="flex-1 p-2 bg-muted rounded text-sm font-mono break-all">
                                  {response.secret_access_key}
                                </code>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    copyToClipboard(response.secret_access_key!, `${response.id}-secret`)
                                  }}
                                >
                                  <Copy className={`h-4 w-4 ${copied === `${response.id}-secret` ? 'text-green-600' : ''}`} />
                                </Button>
                              </div>
                            </div>

                            <div>
                              <label className="text-xs font-medium text-muted-foreground uppercase">
                                Session Token
                              </label>
                              <div className="flex items-center mt-1">
                                <code className="flex-1 p-2 bg-muted rounded text-sm font-mono break-all max-h-24 overflow-auto">
                                  {response.session_token}
                                </code>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    copyToClipboard(response.session_token!, `${response.id}-session`)
                                  }}
                                >
                                  <Copy className={`h-4 w-4 ${copied === `${response.id}-session` ? 'text-green-600' : ''}`} />
                                </Button>
                              </div>
                            </div>

                            {response.cred_expiration && (
                              <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                                <p className="text-sm text-yellow-800">
                                  <strong>Expires:</strong> {new Date(response.cred_expiration).toLocaleString()}
                                </p>
                              </div>
                            )}
                          </div>

                          {/* IAM Policy */}
                          {response.policy_json && (
                            <details className="mt-4">
                              <summary className="cursor-pointer text-sm font-medium flex items-center gap-2 hover:text-primary">
                                <Shield className="h-4 w-4" />
                                View IAM Policy
                              </summary>
                              <pre className="mt-2 p-3 bg-muted rounded text-xs overflow-x-auto whitespace-pre-wrap break-words max-h-64">
                                {JSON.stringify(JSON.parse(response.policy_json), null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      )}

                      {/* Show message if no credentials */}
                      {!response.access_key_id && (
                        <div className="text-center py-4 text-muted-foreground">
                          <p className="text-sm">No credentials provided yet</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Rejected Response Notes */}
                  {response.status === 'REJECTED' && response.notes && (
                    <div className="p-4 border-t bg-red-50/50">
                      <p className="text-sm font-medium text-red-800 mb-1">Rejection Reason</p>
                      <p className="text-sm text-red-700">{response.notes}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
