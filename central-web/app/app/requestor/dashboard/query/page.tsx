'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  requestorApi, 
  DataAccessRequest, 
  NodeAccessResponse, 
  QueryResult, 
  SchemaInfo, 
  TableInfo, 
  ColumnInfo 
} from '@/lib/requestor_api'
import { 
  Play, 
  Database, 
  Table as TableIcon, 
  Columns, 
  Clock, 
  AlertCircle, 
  ChevronRight, 
  ChevronDown, 
  RefreshCw,
  Key,
  Info
} from 'lucide-react'

export default function RequestorQueryPage() {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<QueryResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [schemas, setSchemas] = useState<SchemaInfo | null>(null)
  const [expandedSchemas, setExpandedSchemas] = useState<Record<string, TableInfo>>({})
  const [expandedTables, setExpandedTables] = useState<Record<string, ColumnInfo[]>>({})
  const [loadingSchemas, setLoadingSchemas] = useState(true)
  const [queryHistory, setQueryHistory] = useState<string[]>([])
  const [clearingCache, setClearingCache] = useState(false)

  // Approved responses with credentials
  const [approvedResponses, setApprovedResponses] = useState<NodeAccessResponse[]>([])
  const [loadingResponses, setLoadingResponses] = useState(true)
  const [selectedResponse, setSelectedResponse] = useState<NodeAccessResponse | null>(null)

  useEffect(() => {
    loadSchemas()
    loadApprovedResponses()
  }, [])

  const loadSchemas = async () => {
    try {
      const data = await requestorApi.getSchemas()
      setSchemas(data)
    } catch (error) {
      console.error('Failed to load schemas:', error)
    } finally {
      setLoadingSchemas(false)
    }
  }

  const loadApprovedResponses = async () => {
    try {
      setLoadingResponses(true)
      const data = await requestorApi.getMyRequests({ limit: 100 })
      
      // Extract all approved responses with credentials
      const responses: NodeAccessResponse[] = []
      data.requests.forEach(request => {
        request.responses?.forEach(resp => {
          if (resp.status === 'APPROVED' && resp.access_key_id) {
            responses.push({
              ...resp,
              // Add reference to parent request for context
            })
          }
        })
      })
      
      setApprovedResponses(responses)
      if (responses.length > 0) {
        setSelectedResponse(responses[0])
      }
    } catch (error) {
      console.error('Failed to load approved responses:', error)
    } finally {
      setLoadingResponses(false)
    }
  }

  const clearCache = async () => {
    setClearingCache(true)
    try {
      await requestorApi.clearCache()
      await loadSchemas()
    } catch (error) {
      console.error('Failed to clear cache:', error)
    } finally {
      setClearingCache(false)
    }
  }

  const loadTables = async (schema: string) => {
    if (expandedSchemas[schema]) {
      const newExpanded = { ...expandedSchemas }
      delete newExpanded[schema]
      setExpandedSchemas(newExpanded)
      return
    }

    try {
      const data = await requestorApi.getTables(schema)
      setExpandedSchemas({ ...expandedSchemas, [schema]: data })
    } catch (error) {
      console.error('Failed to load tables:', error)
    }
  }

  const loadColumns = async (schema: string, table: string) => {
    const key = `${schema}.${table}`
    if (expandedTables[key]) {
      const newExpanded = { ...expandedTables }
      delete newExpanded[key]
      setExpandedTables(newExpanded)
      return
    }

    try {
      const data = await requestorApi.getColumns(schema, table)
      setExpandedTables({ ...expandedTables, [key]: data.columns })
    } catch (error) {
      console.error('Failed to load columns:', error)
    }
  }

  const executeQuery = async () => {
    if (!query.trim()) return

    setLoading(true)
    setResult(null)

    try {
      const data = await requestorApi.executeQuery(query.trim())
      setResult(data)

      if (!data.error) {
        setQueryHistory((prev) => [query, ...prev.filter((q) => q !== query)].slice(0, 10))
      }
    } catch (error) {
      setResult({
        columns: [],
        rows: [],
        row_count: 0,
        duration: '0s',
        error: 'Failed to execute query',
      })
    } finally {
      setLoading(false)
    }
  }

  const insertTableInQuery = (schema: string, table: string) => {
    const tableRef = `iceberg."${schema}".${table}`
    const newQuery = query ? `${query}\n${tableRef}` : `SELECT * FROM ${tableRef} LIMIT 10`
    setQuery(newQuery)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Query Console</h2>
          <p className="text-muted-foreground">
            Execute SQL queries on approved hospital data
          </p>
        </div>
        <Button variant="outline" onClick={clearCache} disabled={clearingCache} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${clearingCache ? 'animate-spin' : ''}`} />
          Refresh Schema
        </Button>
      </div>

      {/* Approved Credentials Info */}
      {loadingResponses ? (
        <Skeleton className="h-24" />
      ) : approvedResponses.length === 0 ? (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Info className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="font-medium text-yellow-800">No Active Credentials</p>
                <p className="text-sm text-yellow-700">
                  You don&apos;t have any approved data access requests with active credentials. 
                  Submit a request and wait for hospital approval to query data.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-green-600" />
              <CardTitle className="text-base">Active Credentials</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {approvedResponses.map((resp) => {
                const isExpired = resp.cred_expiration && new Date(resp.cred_expiration) < new Date()
                return (
                  <Badge 
                    key={resp.id}
                    variant={isExpired ? 'outline' : 'secondary'}
                    className={`cursor-pointer ${
                      selectedResponse?.id === resp.id ? 'ring-2 ring-indigo-500' : ''
                    } ${isExpired ? 'opacity-50' : ''}`}
                    onClick={() => !isExpired && setSelectedResponse(resp)}
                  >
                    {resp.hospital?.name || resp.hospital_id.substring(0, 8)}
                    {resp.departments && resp.departments.length > 0 && (
                      <span className="ml-1 text-xs opacity-70">
                        ({resp.departments.join(', ')})
                      </span>
                    )}
                    {isExpired && <span className="ml-1 text-xs">(expired)</span>}
                  </Badge>
                )
              })}
            </div>
            {selectedResponse && (
              <div className="mt-3 p-3 bg-muted rounded-lg text-sm">
                <p><strong>Selected:</strong> {selectedResponse.hospital?.name}</p>
                {selectedResponse.date_range_start && selectedResponse.date_range_end && (
                  <p className="text-muted-foreground">
                    Data range: {selectedResponse.date_range_start} to {selectedResponse.date_range_end}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Schema Browser */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-4 w-4" />
              Schema Browser
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loadingSchemas ? (
              <div className="p-4 space-y-2">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                {schemas?.schemas?.map((schema) => (
                  <div key={schema} className="border-b last:border-b-0">
                    <button
                      className="w-full px-4 py-2 flex items-center gap-2 hover:bg-muted text-left text-sm"
                      onClick={() => loadTables(schema)}
                    >
                      {expandedSchemas[schema] ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <Database className="h-4 w-4 text-blue-600" />
                      <span className="truncate">{schema}</span>
                    </button>

                    {expandedSchemas[schema] && (
                      <div className="pl-8 bg-muted/30">
                        {expandedSchemas[schema].tables?.map((table) => (
                          <div key={table}>
                            <button
                              className="w-full px-4 py-1.5 flex items-center gap-2 hover:bg-muted text-left text-sm"
                              onClick={() => loadColumns(schema, table)}
                              onDoubleClick={() => insertTableInQuery(schema, table)}
                            >
                              {expandedTables[`${schema}.${table}`] ? (
                                <ChevronDown className="h-3 w-3 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                              )}
                              <TableIcon className="h-3 w-3 text-green-600" />
                              <span className="truncate">{table}</span>
                            </button>

                            {expandedTables[`${schema}.${table}`] && (
                              <div className="pl-8 py-1 bg-muted/50">
                                {expandedTables[`${schema}.${table}`].map((col) => (
                                  <div
                                    key={col.Column}
                                    className="px-4 py-0.5 flex items-center gap-2 text-xs text-muted-foreground"
                                  >
                                    <Columns className="h-3 w-3" />
                                    <span>{col.Column}</span>
                                    <span className="text-blue-600">{col.Type}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Query Editor & Results */}
        <div className="lg:col-span-3 space-y-4">
          {/* Query Editor */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">SQL Query</CardTitle>
              <CardDescription>
                Write and execute SQL queries. Double-click a table to insert it.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="SELECT * FROM iceberg.&quot;hospital_xxx&quot;.patients LIMIT 10"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="font-mono text-sm min-h-32"
              />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {queryHistory.length > 0 && (
                    <Select onValueChange={setQuery}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Query history" />
                      </SelectTrigger>
                      <SelectContent>
                        {queryHistory.map((q, i) => (
                          <SelectItem key={i} value={q} className="font-mono text-xs">
                            {q.substring(0, 50)}...
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <Button onClick={executeQuery} disabled={loading || !query.trim()} className="gap-2">
                  {loading ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                      Running...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      Run Query
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Results */}
          {result && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Results</CardTitle>
                  {!result.error && (
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{result.row_count} row(s)</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {result.duration}
                      </span>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {result.error ? (
                  <div className="flex items-start gap-2 text-destructive bg-destructive/10 p-4 rounded-md">
                    <AlertCircle className="h-5 w-5 mt-0.5" />
                    <pre className="text-sm whitespace-pre-wrap">{result.error}</pre>
                  </div>
                ) : result.rows.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No results returned</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {result.columns.map((col, i) => (
                            <TableHead key={i} className="font-mono text-xs">
                              {col}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.rows.slice(0, 100).map((row, i) => (
                          <TableRow key={i}>
                            {row.map((cell, j) => (
                              <TableCell key={j} className="font-mono text-xs">
                                {cell === null ? (
                                  <span className="text-muted-foreground italic">null</span>
                                ) : typeof cell === 'object' ? (
                                  JSON.stringify(cell)
                                ) : (
                                  String(cell)
                                )}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {result.rows.length > 100 && (
                      <p className="text-sm text-muted-foreground text-center py-2">
                        Showing first 100 of {result.row_count} rows
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
