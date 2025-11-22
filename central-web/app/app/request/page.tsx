'use client'

import { useState, useEffect, FormEvent } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { api, DataAccessRequest, Hospital } from '@/lib/api'
import { Hospital as HospitalIcon, Send, CheckCircle, AlertCircle, Search, X } from 'lucide-react'

export default function PublicRequestPage() {
  const [formData, setFormData] = useState({
    requestor_email: '',
    purpose: '',
    data_query_fields: 'patient_id,diagnosis,treatment,medications',
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [requestId, setRequestId] = useState<string | null>(null)

  // Hospital selection state
  const [hospitals, setHospitals] = useState<Hospital[]>([])
  const [loadingHospitals, setLoadingHospitals] = useState(true)
  const [selectedHospitals, setSelectedHospitals] = useState<string[]>([])
  const [hospitalSearch, setHospitalSearch] = useState('')

  // Status check state
  const [checkId, setCheckId] = useState('')
  const [checking, setChecking] = useState(false)
  const [requestStatus, setRequestStatus] = useState<DataAccessRequest | null>(null)

  useEffect(() => {
    loadHospitals()
  }, [])

  const loadHospitals = async () => {
    try {
      // Try to fetch hospitals - this requires auth, so it will fail on public page
      // We'll handle this gracefully by showing an empty list
      const data = await api.getAllHospitals()
      console.log('Loaded hospitals:', data)
      const approved = data.filter((h: Hospital) => h.status === 'ACTIVE')
      console.log('Approved hospitals:', approved)
      setHospitals(approved)
    } catch (err: any) {
      console.error('Failed to load hospitals:', err)
      // If authentication fails, just show empty list
      // User can still manually enter hospital IDs if needed
      setHospitals([])
    } finally {
      setLoadingHospitals(false)
    }
  }

  const toggleHospital = (hospitalId: string) => {
    setSelectedHospitals(prev =>
      prev.includes(hospitalId)
        ? prev.filter(id => id !== hospitalId)
        : [...prev, hospitalId]
    )
  }

  const filteredHospitals = hospitals.filter(h => {
    if (!hospitalSearch) return true
    const searchLower = hospitalSearch.toLowerCase()
    
    console.log('Filtering hospital:', h.name, h.email)
    console.log('Search term:', searchLower)
    
    const nameMatch = h.name?.toLowerCase().includes(searchLower)
    const emailMatch = h.email?.toLowerCase().includes(searchLower)
    
    console.log('Name match:', nameMatch, 'Email match:', emailMatch)
    
    return nameMatch || emailMatch
  })
  
  console.log('=== FILTER DEBUG ===')
  console.log('Total hospitals in state:', hospitals.length)
  console.log('Hospitals:', hospitals)
  console.log('Search term:', hospitalSearch)
  console.log('Filtered results:', filteredHospitals.length)
  console.log('Filtered hospitals:', filteredHospitals)
  console.log('===================')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    if (selectedHospitals.length === 0) {
      setError('Please select at least one hospital')
      setSubmitting(false)
      return
    }

    try {
      const fieldsArray = formData.data_query_fields
        .split(',')
        .map(f => f.trim())
        .filter(f => f)

      const dataQuery = {
        fields: fieldsArray,
        conditions: {}
      }

      const response = await api.createDataAccessRequest({
        requestor_email: formData.requestor_email,
        requested_nodes: selectedHospitals,
        data_query: dataQuery,
        purpose: formData.purpose,
        expires_in: 30
      })

      setRequestId(response.id)
      setSubmitted(true)
    } catch (err: any) {
      setError(err.message || 'Failed to submit request')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCheckStatus = async () => {
    if (!checkId.trim()) return
    
    setChecking(true)
    setError('')
    setRequestStatus(null)

    try {
      const response = await api.getRequestStatus(checkId)
      setRequestStatus(response)
    } catch (err: any) {
      setError(err.message || 'Request not found')
    } finally {
      setChecking(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Request Submitted Successfully!</CardTitle>
            <CardDescription>
              Your data access request has been forwarded to {selectedHospitals.length} hospital(s)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-gray-50 p-4 rounded-lg space-y-2">
              <p className="text-sm font-medium text-gray-700">Your Request ID:</p>
              <code className="block bg-white px-4 py-2 rounded border text-lg font-mono break-all">
                {requestId}
              </code>
              <p className="text-xs text-muted-foreground">
                Save this ID to check your request status later
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium">What happens next?</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 text-green-600 flex-shrink-0" />
                  Your request is being processed by the selected hospitals
                </li>
                <li className="flex gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 text-green-600 flex-shrink-0" />
                  Hospitals will review and respond to your request
                </li>
                <li className="flex gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 text-green-600 flex-shrink-0" />
                  Results will be aggregated and made available
                </li>
              </ul>
            </div>

            <Button onClick={() => window.location.reload()} variant="outline" className="w-full">
              Submit Another Request
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto py-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <HospitalIcon className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Hospital Management System
          </h1>
          <p className="text-gray-600">
            Federated Data Access Portal
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="w-5 h-5" />
                Request Data Access
              </CardTitle>
              <CardDescription>
                Submit a request to access federated hospital data
              </CardDescription>
            </CardHeader>
            <CardContent>
              {error && (
                <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md flex items-center gap-2 mb-4">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm">{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email Address</label>
                  <Input
                    type="email"
                    placeholder="researcher@university.edu"
                    value={formData.requestor_email}
                    onChange={(e) => setFormData({ ...formData, requestor_email: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Purpose of Request</label>
                  <Textarea
                    placeholder="Describe the research purpose and how the data will be used..."
                    value={formData.purpose}
                    onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                    required
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Data Fields (comma-separated)
                  </label>
                  <Input
                    placeholder="patient_id,diagnosis,treatment,medications"
                    value={formData.data_query_fields}
                    onChange={(e) => setFormData({ ...formData, data_query_fields: e.target.value })}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Specify which fields you need from the hospital records
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Select Target Hospitals ({selectedHospitals.length} selected)
                  </label>
                  
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search hospitals..."
                      value={hospitalSearch}
                      onChange={(e) => setHospitalSearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>

                  {selectedHospitals.length > 0 && (
                    <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-md">
                      {selectedHospitals.map(id => {
                        const hospital = hospitals.find(h => h.id === id)
                        return (
                          <Badge key={id} variant="secondary" className="gap-1">
                            {hospital?.name || id.substring(0, 8)}
                            <X
                              className="w-3 h-3 cursor-pointer hover:text-destructive"
                              onClick={() => toggleHospital(id)}
                            />
                          </Badge>
                        )
                      })}
                    </div>
                  )}

                  <div className="border rounded-md max-h-48 overflow-y-auto">
                    {loadingHospitals ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        Loading hospitals...
                      </div>
                    ) : filteredHospitals.length === 0 ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        {hospitalSearch ? 'No matching hospitals' : 'No hospitals available'}
                      </div>
                    ) : (
                      <div className="divide-y">
                        {filteredHospitals.map(hospital => (
                          <div
                            key={hospital.id}
                            onClick={() => toggleHospital(hospital.id)}
                            className={`p-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                              selectedHospitals.includes(hospital.id) ? 'bg-blue-50 border-l-2 border-blue-500' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <p className="text-sm font-medium">{hospital.name}</p>
                                <p className="text-xs text-muted-foreground">{hospital.email}</p>
                              </div>
                              {selectedHospitals.includes(hospital.id) && (
                                <CheckCircle className="w-4 h-4 text-blue-600" />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <Button type="submit" disabled={submitting || selectedHospitals.length === 0} className="w-full gap-2">
                  {submitting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Submit Request to {selectedHospitals.length} Hospital(s)
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="w-5 h-5" />
                Check Request Status
              </CardTitle>
              <CardDescription>
                Enter your request ID to track progress
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Request ID</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Paste your request ID here"
                    value={checkId}
                    onChange={(e) => setCheckId(e.target.value)}
                  />
                  <Button
                    onClick={handleCheckStatus}
                    disabled={checking || !checkId.trim()}
                    className="gap-2"
                  >
                    {checking ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              {requestStatus && (
                <div className="space-y-4 mt-6">
                  <div className="p-4 bg-gray-50 rounded-lg space-y-3">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Requester Email</p>
                      <p className="text-sm font-medium">{requestStatus.requestor_email}</p>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Purpose</p>
                      <p className="text-sm">{requestStatus.purpose}</p>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Target Hospitals</p>
                      <div className="flex flex-wrap gap-2">
                        {requestStatus.requested_nodes.map((nodeId) => (
                          <Badge key={nodeId} variant="outline" className="text-xs">
                            {hospitals.find(h => h.id === nodeId)?.name || nodeId.substring(0, 8) + '...'}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Status</p>
                      <Badge className="capitalize">
                        {requestStatus.status}
                      </Badge>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Responses</p>
                      <p className="text-sm font-medium">
                        {requestStatus.responses?.length || 0} of {requestStatus.requested_nodes.length} hospitals responded
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {!requestStatus && (
                <div className="text-center py-12 text-muted-foreground">
                  <Search className="w-12 h-12 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Enter a request ID to check status</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 text-center space-x-4">
          <a
            href="/hospital/login"
            className="text-sm text-gray-600 hover:text-gray-900 underline"
          >
            Hospital Portal →
          </a>
          <span className="text-gray-400">|</span>
          <a
            href="/dashboard"
            className="text-sm text-gray-600 hover:text-gray-900 underline"
          >
            Admin Portal →
          </a>
        </div>
      </div>
    </div>
  )
}
