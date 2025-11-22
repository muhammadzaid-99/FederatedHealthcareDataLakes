'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
import { CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react'

export default function PendingRegistrationsPage() {
  const [hospitals, setHospitals] = useState<Hospital[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    loadPendingRegistrations()
  }, [])

  const loadPendingRegistrations = async () => {
    try {
      setError('')
      const data = await api.getPendingRegistrations()
      setHospitals(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (hospitalId: string) => {
    setProcessingId(hospitalId)
    try {
      await api.approveHospital(hospitalId)
      await loadPendingRegistrations()
    } catch (err: any) {
      alert('Failed to approve hospital: ' + err.message)
    } finally {
      setProcessingId(null)
    }
  }

  const handleReject = async (hospitalId: string) => {
    if (!confirm('Are you sure you want to reject this hospital registration?')) {
      return
    }
    
    setProcessingId(hospitalId)
    try {
      await api.rejectHospital(hospitalId)
      await loadPendingRegistrations()
    } catch (err: any) {
      alert('Failed to reject hospital: ' + err.message)
    } finally {
      setProcessingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Pending Registrations</h2>
        <p className="text-muted-foreground">
          Review and approve hospital registration requests
        </p>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Pending Hospitals</CardTitle>
          <CardDescription>
            {loading ? 'Loading...' : `${hospitals.length} hospital(s) awaiting approval`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : hospitals.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-20" />
              <p className="text-lg font-medium mb-2">No pending registrations</p>
              <p className="text-sm text-muted-foreground">
                All hospital registrations have been processed
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hospital Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Registered</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hospitals.map((hospital) => (
                  <TableRow key={hospital.id}>
                    <TableCell className="font-medium">{hospital.name}</TableCell>
                    <TableCell>{hospital.email}</TableCell>
                    <TableCell>{formatDate(hospital.created_at)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1">
                        <Clock className="w-3 h-3" />
                        Pending
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleApprove(hospital.id)}
                          disabled={processingId === hospital.id}
                          className="gap-1"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleReject(hospital.id)}
                          disabled={processingId === hospital.id}
                          className="gap-1"
                        >
                          <XCircle className="w-4 h-4" />
                          Reject
                        </Button>
                      </div>
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
