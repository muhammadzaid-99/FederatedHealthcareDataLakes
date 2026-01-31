'use client'

import { useState, useEffect, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { requestorApi, Hospital, AVAILABLE_DEPARTMENTS } from '@/lib/requestor_api'
import { 
  ArrowLeft, 
  AlertCircle, 
  Loader2, 
  Building2, 
  CheckCircle,
  Search,
  X
} from 'lucide-react'

export default function NewRequestPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [newRequestId, setNewRequestId] = useState<string | null>(null)

  // Form state
  const [purpose, setPurpose] = useState('')
  const [expiresIn, setExpiresIn] = useState(30)
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([])
  const [selectedHospitals, setSelectedHospitals] = useState<string[]>([])

  // Hospital data
  const [hospitals, setHospitals] = useState<Hospital[]>([])
  const [hospitalSearch, setHospitalSearch] = useState('')

  useEffect(() => {
    loadHospitals()
  }, [])

  const loadHospitals = async () => {
    try {
      setLoading(true)
      const data = await requestorApi.getActiveHospitals()
      setHospitals(data)
    } catch (err: any) {
      setError(err.message || 'Failed to load hospitals')
    } finally {
      setLoading(false)
    }
  }

  const toggleDepartment = (dept: string) => {
    setSelectedDepartments(prev =>
      prev.includes(dept)
        ? prev.filter(d => d !== dept)
        : [...prev, dept]
    )
  }

  const toggleHospital = (hospitalId: string) => {
    setSelectedHospitals(prev =>
      prev.includes(hospitalId)
        ? prev.filter(id => id !== hospitalId)
        : [...prev, hospitalId]
    )
  }

  const selectAllHospitals = () => {
    setSelectedHospitals(hospitals.map(h => h.id))
  }

  const clearHospitalSelection = () => {
    setSelectedHospitals([])
  }

  const filteredHospitals = hospitals.filter(h => {
    if (!hospitalSearch) return true
    const searchLower = hospitalSearch.toLowerCase()
    return (
      h.name?.toLowerCase().includes(searchLower) ||
      h.admin_email?.toLowerCase().includes(searchLower)
    )
  })

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (selectedHospitals.length === 0) {
      setError('Please select at least one hospital')
      return
    }

    if (selectedDepartments.length === 0) {
      setError('Please select at least one department')
      return
    }

    if (!purpose.trim()) {
      setError('Please provide a purpose for your request')
      return
    }

    setSubmitting(true)

    try {
      const response = await requestorApi.createRequest({
        requested_nodes: selectedHospitals,
        departments: selectedDepartments,
        purpose: purpose.trim(),
        expires_in: expiresIn,
      })

      setNewRequestId(response.request.id)
      setSuccess(true)
    } catch (err: any) {
      setError(err.message || 'Failed to create request')
    } finally {
      setSubmitting(false)
    }
  }

  if (success && newRequestId) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Request Submitted</CardTitle>
            <CardDescription className="mt-2">
              Your data access request has been created and forwarded to the selected hospitals.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm font-medium">Request ID</p>
              <p className="text-sm font-mono">{newRequestId}</p>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={() => router.push(`/requestor/dashboard/requests/${newRequestId}`)}
                className="flex-1"
              >
                View Request Details
              </Button>
              <Button 
                variant="outline"
                onClick={() => router.push('/requestor/dashboard/requests')}
              >
                Back to Requests
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => router.back()} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">New Data Access Request</h2>
          <p className="text-muted-foreground">
            Request access to health data from federated hospitals
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Purpose */}
        <Card>
          <CardHeader>
            <CardTitle>Request Details</CardTitle>
            <CardDescription>
              Describe the purpose of your data access request
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="purpose">Purpose *</Label>
              <Textarea
                id="purpose"
                placeholder="e.g., Research study on cardiovascular disease patterns in the region..."
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                rows={4}
                required
              />
              <p className="text-xs text-muted-foreground">
                Provide a clear description of why you need access to this data
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="expires">Request Validity (days)</Label>
              <Input
                id="expires"
                type="number"
                min={1}
                max={365}
                value={expiresIn}
                onChange={(e) => setExpiresIn(parseInt(e.target.value) || 30)}
                className="w-32"
              />
              <p className="text-xs text-muted-foreground">
                How long should the request remain valid for hospital approval
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Departments */}
        <Card>
          <CardHeader>
            <CardTitle>Select Departments *</CardTitle>
            <CardDescription>
              Choose the departments whose data you want to access
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {AVAILABLE_DEPARTMENTS.map((dept) => (
                <div
                  key={dept}
                  className={`flex items-center space-x-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedDepartments.includes(dept)
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'hover:bg-muted'
                  }`}
                  onClick={() => toggleDepartment(dept)}
                >
                  <Checkbox
                    checked={selectedDepartments.includes(dept)}
                    onClick={(e) => e.stopPropagation()}
                    onCheckedChange={() => toggleDepartment(dept)}
                  />
                  <Label className="cursor-pointer">{dept}</Label>
                </div>
              ))}
            </div>
            {selectedDepartments.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="text-sm text-muted-foreground">Selected:</span>
                {selectedDepartments.map((dept) => (
                  <Badge key={dept} variant="secondary" className="gap-1">
                    {dept}
                    <X 
                      className="w-3 h-3 cursor-pointer" 
                      onClick={() => toggleDepartment(dept)}
                    />
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Hospitals */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Select Hospitals *</CardTitle>
                <CardDescription>
                  Choose the hospitals you want to request data from
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={selectAllHospitals}
                >
                  Select All
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={clearHospitalSelection}
                >
                  Clear
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : hospitals.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Building2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No active hospitals available</p>
              </div>
            ) : (
              <>
                {/* Search */}
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search hospitals..."
                    value={hospitalSearch}
                    onChange={(e) => setHospitalSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {/* Hospital List */}
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {filteredHospitals.map((hospital) => (
                    <div
                      key={hospital.id}
                      className={`flex items-center space-x-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedHospitals.includes(hospital.id)
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'hover:bg-muted'
                      }`}
                      onClick={() => toggleHospital(hospital.id)}
                    >
                      <Checkbox
                        checked={selectedHospitals.includes(hospital.id)}
                        onClick={(e) => e.stopPropagation()}
                        onCheckedChange={() => toggleHospital(hospital.id)}
                      />
                      <div className="flex-1">
                        <p className="font-medium">{hospital.name}</p>
                        <p className="text-sm text-muted-foreground">{hospital.admin_email}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {selectedHospitals.length > 0 && (
                  <div className="mt-4 p-3 bg-muted rounded-lg">
                    <p className="text-sm font-medium">
                      {selectedHospitals.length} hospital(s) selected
                    </p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex justify-end gap-4">
          <Button 
            type="button" 
            variant="outline"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit Request'
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
