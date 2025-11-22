'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { 
  Building2, 
  Key, 
  CheckCircle, 
  Clock, 
  XCircle, 
  Copy,
  LogOut,
  AlertCircle,
  FileText
} from 'lucide-react'

interface HospitalInfo {
  id: string
  name: string
  email: string  // Backend returns 'email' field
  status: string
  client_id?: string
  client_secret?: string
  nessie_namespace?: string
  queue_name?: string
  created_at: string
  updated_at: string
  handshake_at?: string
}

export default function HospitalDashboardPage() {
  const router = useRouter()
  const [hospital, setHospital] = useState<HospitalInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copiedField, setCopiedField] = useState<string | null>(null)

  useEffect(() => {
    loadHospitalInfo()
  }, [])

  const loadHospitalInfo = async () => {
    const token = localStorage.getItem('hospitalToken')
    
    if (!token) {
      router.push('/hospital/login')
      return
    }

    try {
      const response = await fetch('http://localhost:8080/api/v1/nodes/status', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem('hospitalToken')
          router.push('/hospital/login')
          return
        }
        throw new Error('Failed to load hospital information')
      }

      const data = await response.json()
      // API returns { hospital: {...}, timestamp: "..." }
      setHospital(data.hospital)
      console.log(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('hospitalToken')
    router.push('/hospital/login')
  }

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return (
          <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
            <Clock className="w-3 h-3 mr-1" />
            Pending Approval
          </Badge>
        )
      case 'CREDENTIALS_ISSUED':
        return (
          <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
            <Key className="w-3 h-3 mr-1" />
            Credentials Issued
          </Badge>
        )
      case 'ACTIVE':
        return (
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
            <CheckCircle className="w-3 h-3 mr-1" />
            Active
          </Badge>
        )
      case 'REJECTED':
        return (
          <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
            <XCircle className="w-3 h-3 mr-1" />
            Rejected
          </Badge>
        )
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-6xl mx-auto p-6">
          <Skeleton className="h-12 w-64 mb-6" />
          <div className="grid md:grid-cols-2 gap-6">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      </div>
    )
  }

  if (error || !hospital) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold mb-2">Error Loading Dashboard</h2>
              <p className="text-gray-600 mb-4">{error || 'Failed to load hospital information'}</p>
              <Button onClick={() => router.push('/hospital/login')}>
                Back to Login
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Building2 className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{hospital.name}</h1>
                <p className="text-sm text-gray-500">{hospital.email}</p>
              </div>
            </div>
            <Button variant="outline" onClick={handleLogout} className="gap-2">
              <LogOut className="w-4 h-4" />
              Logout
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Status Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Application Status</CardTitle>
                <CardDescription>Current registration status</CardDescription>
              </div>
              {getStatusBadge(hospital.status)}
            </div>
          </CardHeader>
          <CardContent>
            {hospital.status === 'PENDING' && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex gap-3">
                  <Clock className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-yellow-900 mb-1">
                      Awaiting Admin Approval
                    </h3>
                    <p className="text-sm text-yellow-800">
                      Your hospital registration is under review. You will receive credentials once approved by the central administrator.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {hospital.status === 'REJECTED' && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex gap-3">
                  <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-red-900 mb-1">
                      Registration Rejected
                    </h3>
                    <p className="text-sm text-red-800">
                      Your hospital registration was not approved. Please contact the administrator for more information.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {(hospital.status === 'CREDENTIALS_ISSUED' || hospital.status === 'ACTIVE') && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-green-900 mb-1">
                      {hospital.status === 'ACTIVE' ? 'Fully Activated' : 'Approved - Credentials Available'}
                    </h3>
                    <p className="text-sm text-green-800">
                      {hospital.status === 'ACTIVE' 
                        ? 'Your hospital is fully connected to the federated network.'
                        : 'Your hospital has been approved. Use the credentials below to connect your node.'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Hospital ID</p>
                <p className="font-mono text-xs mt-1">{hospital.id}</p>
              </div>
              <div>
                <p className="text-gray-500">Registered</p>
                <p className="font-medium mt-1">
                  {new Date(hospital.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Credentials Card */}
        {(hospital.status === 'CREDENTIALS_ISSUED' || hospital.status === 'ACTIVE') && hospital.client_id && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="w-5 h-5" />
                API Credentials
              </CardTitle>
              <CardDescription>
                Use these credentials to connect your hospital node
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-4 h-4 text-blue-600" />
                  <p className="text-sm font-medium text-blue-900">
                    Important: Keep these credentials secure
                  </p>
                </div>
                <p className="text-xs text-blue-800">
                  These credentials provide access to your hospital's data infrastructure. Never share them publicly.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">
                    Client ID
                  </label>
                  <div className="flex gap-2">
                    <code className="flex-1 bg-gray-100 px-3 py-2 rounded text-sm font-mono break-all">
                      {hospital.client_id}
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(hospital.client_id!, 'client_id')}
                    >
                      {copiedField === 'client_id' ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {hospital.client_secret && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">
                      Client Secret
                    </label>
                    <div className="flex gap-2">
                      <code className="flex-1 bg-gray-100 px-3 py-2 rounded text-sm font-mono break-all">
                        {hospital.client_secret}
                      </code>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(hospital.client_secret!, 'client_secret')}
                      >
                        {copiedField === 'client_secret' ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {hospital.nessie_namespace && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">
                      Nessie Namespace
                    </label>
                    <code className="block bg-gray-100 px-3 py-2 rounded text-sm font-mono break-all">
                      {hospital.nessie_namespace}
                    </code>
                  </div>
                )}

                {hospital.queue_name && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">
                      RabbitMQ Queue
                    </label>
                    <code className="block bg-gray-100 px-3 py-2 rounded text-sm font-mono break-all">
                      {hospital.queue_name}
                    </code>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Data Requests Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Incoming Data Requests
            </CardTitle>
            <CardDescription>
              Requests forwarded to your hospital queue
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No incoming requests yet</p>
              <p className="text-xs mt-1">
                Data access requests will appear here when submitted
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
