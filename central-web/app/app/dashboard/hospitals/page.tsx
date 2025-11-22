'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { formatDate, getStatusColor } from '@/lib/utils'
import { Building2, CheckCircle, Clock, XCircle, AlertCircle } from 'lucide-react'

export default function HospitalsPage() {
  const [hospitals, setHospitals] = useState<Hospital[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadHospitals()
  }, [])

  const loadHospitals = async () => {
    try {
      setError('')
      const data = await api.getAllHospitals()
      // Only show approved hospitals (CREDENTIALS_ISSUED and ACTIVE)
      const approvedHospitals = data.filter((h: Hospital) => 
        h.status === 'CREDENTIALS_ISSUED' || h.status === 'ACTIVE'
      )
      setHospitals(approvedHospitals)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'approved':
        return <CheckCircle className="w-4 h-4 text-green-600" />
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-600" />
      case 'rejected':
        return <XCircle className="w-4 h-4 text-red-600" />
      default:
        return null
    }
  }

  const approvedCount = hospitals.filter(h => h.status === 'approved').length
  const pendingCount = hospitals.filter(h => h.status === 'pending').length

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">All Hospitals</h2>
        <p className="text-muted-foreground">
          Manage all registered hospitals in the system
        </p>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Hospitals</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{hospitals.length}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-green-600">{approvedCount}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Hospitals List */}
      <Card>
        <CardHeader>
          <CardTitle>Registered Hospitals</CardTitle>
          <CardDescription>
            {loading ? 'Loading...' : `Showing ${hospitals.length} hospital(s)`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : hospitals.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-20" />
              <p className="text-lg font-medium mb-2">No hospitals registered</p>
              <p className="text-sm text-muted-foreground">
                Waiting for hospitals to register
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hospital Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Client ID</TableHead>
                  <TableHead>Namespace</TableHead>
                  <TableHead>Registered</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hospitals.map((hospital) => (
                  <TableRow key={hospital.id}>
                    <TableCell className="font-medium">{hospital.name}</TableCell>
                    <TableCell>{hospital.email}</TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(hospital.status)}>
                        <span className="flex items-center gap-1">
                          {getStatusIcon(hospital.status)}
                          {hospital.status}
                        </span>
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {hospital.client_id ? (
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                          {hospital.client_id.substring(0, 16)}...
                        </code>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {hospital.nessie_namespace ? (
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                          {hospital.nessie_namespace}
                        </code>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(hospital.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
