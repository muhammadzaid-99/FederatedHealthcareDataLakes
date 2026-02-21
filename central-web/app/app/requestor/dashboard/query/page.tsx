'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  requestorApi, 
  ApprovedAccess,
  QueryResult, 
  SchemaInfo, 
  TableInfo, 
  ColumnInfo,
  StructuredQueryPayload,
  HospitalSelection,
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
  Info,
  Plus,
  Trash2,
  Eye,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Per-hospital selection state used by the form
// ---------------------------------------------------------------------------
interface SelectionState {
  accessResponseId: string
  departments: string[]
  dateRangeStart: string
  dateRangeEnd: string
  // Derived from the approved response for display / validation
  approvedDepartments: string[]
  approvedDateStart: string
  approvedDateEnd: string
  hospitalName: string
}

const emptySelection = (): SelectionState => ({
  accessResponseId: '',
  departments: [],
  dateRangeStart: '',
  dateRangeEnd: '',
  approvedDepartments: [],
  approvedDateStart: '',
  approvedDateEnd: '',
  hospitalName: '',
})

export default function RequestorQueryPage() {
  // Schema browser
  const [schemas, setSchemas] = useState<SchemaInfo | null>(null)
  const [expandedSchemas, setExpandedSchemas] = useState<Record<string, TableInfo>>({})
  const [expandedTables, setExpandedTables] = useState<Record<string, ColumnInfo[]>>({})
  const [loadingSchemas, setLoadingSchemas] = useState(true)

  // Approved access
  const [approvedAccess, setApprovedAccess] = useState<ApprovedAccess[]>([])
  const [loadingAccess, setLoadingAccess] = useState(true)

  // Structured query builder
  const [selections, setSelections] = useState<SelectionState[]>([emptySelection()])
  const [tableName, setTableName] = useState('fhir_data')
  const [columnsInput, setColumnsInput] = useState('') // comma-separated, empty = *
  const [limit, setLimit] = useState(1000)

  // Execution
  const [result, setResult] = useState<QueryResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [sqlPreview, setSqlPreview] = useState('')

  // ---- data loading -------------------------------------------------------

  useEffect(() => {
    loadSchemas()
    loadApprovedAccess()
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

  const loadApprovedAccess = async () => {
    try {
      setLoadingAccess(true)
      const data = await requestorApi.getApprovedAccess()
      setApprovedAccess(data.responses || [])
    } catch (error) {
      console.error('Failed to load approved access:', error)
    } finally {
      setLoadingAccess(false)
    }
  }

  const loadTables = async (schema: string) => {
    if (expandedSchemas[schema]) {
      const copy = { ...expandedSchemas }
      delete copy[schema]
      setExpandedSchemas(copy)
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
      const copy = { ...expandedTables }
      delete copy[key]
      setExpandedTables(copy)
      return
    }
    try {
      const data = await requestorApi.getColumns(schema, table)
      setExpandedTables({ ...expandedTables, [key]: data.columns })
    } catch (error) {
      console.error('Failed to load columns:', error)
    }
  }

  // ---- selection helpers --------------------------------------------------

  const updateSelection = (index: number, patch: Partial<SelectionState>) => {
    setSelections(prev => {
      const copy = [...prev]
      copy[index] = { ...copy[index], ...patch }
      return copy
    })
  }

  const addSelection = () => {
    setSelections(prev => [...prev, emptySelection()])
  }

  const removeSelection = (index: number) => {
    setSelections(prev => prev.filter((_, i) => i !== index))
  }

  const handleAccessResponseChange = (index: number, responseId: string) => {
    const resp = approvedAccess.find(r => r.id === responseId)
    if (!resp) return
    updateSelection(index, {
      accessResponseId: responseId,
      approvedDepartments: resp.departments || [],
      departments: resp.departments || [], // pre-select all approved departments
      approvedDateStart: resp.date_range_start || '',
      approvedDateEnd: resp.date_range_end || '',
      dateRangeStart: resp.date_range_start || '',
      dateRangeEnd: resp.date_range_end || '',
      hospitalName: resp.hospital?.name || resp.hospital_id,
    })
  }

  const toggleDepartment = (index: number, dept: string) => {
    setSelections(prev => {
      const copy = [...prev]
      const sel = copy[index]
      if (sel.departments.includes(dept)) {
        copy[index] = { ...sel, departments: sel.departments.filter(d => d !== dept) }
      } else {
        copy[index] = { ...sel, departments: [...sel.departments, dept] }
      }
      return copy
    })
  }

  // ---- SQL preview --------------------------------------------------------

  const buildSqlPreview = useCallback(() => {
    const cols = columnsInput.trim() ? columnsInput.split(',').map(c => c.trim()).join(', ') : '*'
    const parts: string[] = []

    for (const sel of selections) {
      if (!sel.accessResponseId || sel.departments.length === 0) continue
      const where: string[] = []
      const deptList = sel.departments.map(d => `'${d}'`).join(', ')
      where.push(`department_name IN (${deptList})`)
      if (sel.dateRangeStart) where.push(`date >= DATE '${sel.dateRangeStart}'`)
      if (sel.dateRangeEnd) where.push(`date <= DATE '${sel.dateRangeEnd}'`)

      parts.push(
        `SELECT ${cols}\n  FROM iceberg."${sel.hospitalName}".${tableName}\n  WHERE ${where.join(' AND ')}`
      )
    }

    if (parts.length === 0) return ''
    return parts.join('\nUNION ALL\n') + `\nLIMIT ${limit}`
  }, [selections, tableName, columnsInput, limit])

  useEffect(() => {
    setSqlPreview(buildSqlPreview())
  }, [buildSqlPreview])

  // ---- execution ----------------------------------------------------------

  const executeQuery = async () => {
    // Build payload
    const validSelections: HospitalSelection[] = selections
      .filter(s => s.accessResponseId && s.departments.length > 0)
      .map(s => ({
        access_response_id: s.accessResponseId,
        departments: s.departments,
        date_range_start: s.dateRangeStart || undefined,
        date_range_end: s.dateRangeEnd || undefined,
      }))

    if (validSelections.length === 0) return

    const payload: StructuredQueryPayload = {
      selections: validSelections,
      table_name: tableName,
      columns: columnsInput.trim() ? columnsInput.split(',').map(c => c.trim()) : [],
      limit,
    }

    setLoading(true)
    setResult(null)
    try {
      const data = await requestorApi.executeStructuredQuery(payload)
      setResult(data)
    } catch (error: any) {
      setResult({
        columns: [],
        rows: [],
        row_count: 0,
        duration: '0s',
        error: error.message || 'Query execution failed',
      })
    } finally {
      setLoading(false)
    }
  }

  const canExecute = selections.some(s => s.accessResponseId && s.departments.length > 0) && tableName.trim() !== ''

  // ---- render -------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Query Console</h2>
          <p className="text-muted-foreground">
            Build and execute secure queries on approved hospital data
          </p>
        </div>
        <Button variant="outline" onClick={loadSchemas} disabled={loadingSchemas} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loadingSchemas ? 'animate-spin' : ''}`} />
          Refresh Schema
        </Button>
      </div>

      {/* No access warning */}
      {!loadingAccess && approvedAccess.length === 0 && (
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
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* =============== Schema Browser (left sidebar) =============== */}
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
              <div className="max-h-[500px] overflow-y-auto">
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

        {/* =============== Query Builder + Results (main area) =============== */}
        <div className="lg:col-span-3 space-y-4">
          {/* Structured Query Builder */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Key className="h-4 w-4 text-green-600" />
                Query Builder
              </CardTitle>
              <CardDescription>
                Select hospitals, departments, and date ranges. Queries are built securely on the server.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Global settings row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="tableName">Table Name</Label>
                  <Input
                    id="tableName"
                    value={tableName}
                    onChange={e => setTableName(e.target.value)}
                    placeholder="fhir_data"
                    className="font-mono"
                  />
                </div>
                <div>
                  <Label htmlFor="columns">Columns (comma-separated, empty = *)</Label>
                  <Input
                    id="columns"
                    value={columnsInput}
                    onChange={e => setColumnsInput(e.target.value)}
                    placeholder="patient_id, department_name, date"
                    className="font-mono"
                  />
                </div>
                <div>
                  <Label htmlFor="limit">Limit</Label>
                  <Input
                    id="limit"
                    type="number"
                    min={1}
                    max={10000}
                    value={limit}
                    onChange={e => setLimit(parseInt(e.target.value) || 1000)}
                  />
                </div>
              </div>

              {/* Hospital Selections */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Hospital Selections</Label>
                  <Button variant="outline" size="sm" onClick={addSelection} className="gap-1">
                    <Plus className="h-3 w-3" />
                    Add Hospital
                  </Button>
                </div>

                {selections.map((sel, idx) => (
                  <Card key={idx} className="border-dashed">
                    <CardContent className="pt-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          {sel.hospitalName || `Selection ${idx + 1}`}
                        </span>
                        {selections.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => removeSelection(idx)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>

                      {/* Access Response picker */}
                      <div>
                        <Label className="text-xs text-muted-foreground">Approved Access</Label>
                        {loadingAccess ? (
                          <Skeleton className="h-9 w-full" />
                        ) : (
                          <Select
                            value={sel.accessResponseId}
                            onValueChange={v => handleAccessResponseChange(idx, v)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Choose an approved access grant…" />
                            </SelectTrigger>
                            <SelectContent>
                              {approvedAccess.map(resp => (
                                <SelectItem key={resp.id} value={resp.id}>
                                  {resp.hospital?.name || resp.hospital_id.substring(0, 8)}
                                  {resp.departments && resp.departments.length > 0 && (
                                    <span className="ml-1 text-xs opacity-70">
                                      ({resp.departments.join(', ')})
                                    </span>
                                  )}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>

                      {/* Department chips (only approved ones are shown) */}
                      {sel.approvedDepartments.length > 0 && (
                        <div>
                          <Label className="text-xs text-muted-foreground">Departments</Label>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {sel.approvedDepartments.map(dept => {
                              const active = sel.departments.includes(dept)
                              return (
                                <Badge
                                  key={dept}
                                  variant={active ? 'default' : 'outline'}
                                  className="cursor-pointer select-none"
                                  onClick={() => toggleDepartment(idx, dept)}
                                >
                                  {dept}
                                </Badge>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Date range */}
                      {(sel.approvedDateStart || sel.approvedDateEnd) && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs text-muted-foreground">
                              Start Date (min: {sel.approvedDateStart || 'any'})
                            </Label>
                            <Input
                              type="date"
                              value={sel.dateRangeStart}
                              min={sel.approvedDateStart || undefined}
                              max={sel.approvedDateEnd || undefined}
                              onChange={e => updateSelection(idx, { dateRangeStart: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">
                              End Date (max: {sel.approvedDateEnd || 'any'})
                            </Label>
                            <Input
                              type="date"
                              value={sel.dateRangeEnd}
                              min={sel.approvedDateStart || undefined}
                              max={sel.approvedDateEnd || undefined}
                              onChange={e => updateSelection(idx, { dateRangeEnd: e.target.value })}
                            />
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* SQL Preview */}
              {sqlPreview && (
                <div>
                  <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                    <Eye className="h-3 w-3" />
                    SQL Preview (built securely on the server)
                  </Label>
                  <pre className="bg-muted p-3 rounded-md text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                    {sqlPreview}
                  </pre>
                </div>
              )}

              {/* Execute button */}
              <div className="flex justify-end">
                <Button
                  onClick={executeQuery}
                  disabled={loading || !canExecute}
                  className="gap-2"
                  size="lg"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                      Running…
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
