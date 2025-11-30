'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Play, Database, Table as TableIcon, Columns, Clock, AlertCircle, ChevronRight, ChevronDown, RefreshCw } from 'lucide-react'

const PROXY_API = 'http://localhost:8081'

interface QueryResult {
  columns: string[]
  rows: any[][]
  row_count: number
  duration: string
  error?: string
}

interface SchemaInfo {
  catalog: string
  schemas: string[]
}

interface TableInfo {
  schema: string
  tables: string[]
}

interface ColumnInfo {
  Column: string
  Type: string
  Extra?: string
  Comment?: string
}

export default function QueryPage() {
  const [query, setQuery] = useState('SELECT * FROM iceberg."hospital_ff69e473-037e-4fb5-8842-c502836844f2".checkups LIMIT 10')
  const [result, setResult] = useState<QueryResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [schemas, setSchemas] = useState<SchemaInfo | null>(null)
  const [expandedSchemas, setExpandedSchemas] = useState<Record<string, TableInfo>>({})
  const [expandedTables, setExpandedTables] = useState<Record<string, ColumnInfo[]>>({})
  const [loadingSchemas, setLoadingSchemas] = useState(true)
  const [queryHistory, setQueryHistory] = useState<string[]>([])
  const [clearingCache, setClearingCache] = useState(false)

  const clearCache = async () => {
    setClearingCache(true)
    try {
      await fetch(`${PROXY_API}/admin/cache/invalidate`, { method: 'POST' })
      // Reload schemas after clearing cache
      await loadSchemas()
    } catch (error) {
      console.error('Failed to clear cache:', error)
    } finally {
      setClearingCache(false)
    }
  }

  useEffect(() => {
    loadSchemas()
  }, [])

  const loadSchemas = async () => {
    try {
      const response = await fetch(`${PROXY_API}/api/trino/schemas`)
      if (response.ok) {
        const data = await response.json()
        console.log(data)
        setSchemas(data)
      }
    } catch (error) {
      console.error('Failed to load schemas:', error)
    } finally {
      setLoadingSchemas(false)
    }
  }

  const loadTables = async (schema: string) => {
    if (expandedSchemas[schema]) {
      // Toggle off
      const newExpanded = { ...expandedSchemas }
      delete newExpanded[schema]
      setExpandedSchemas(newExpanded)
      return
    }

    try {
      const response = await fetch(`${PROXY_API}/api/trino/schemas/${encodeURIComponent(schema)}/tables`)
      if (response.ok) {
        const data = await response.json()
        setExpandedSchemas({ ...expandedSchemas, [schema]: data })
      }
    } catch (error) {
      console.error('Failed to load tables:', error)
    }
  }

  const loadColumns = async (schema: string, table: string) => {
    const key = `${schema}.${table}`
    if (expandedTables[key]) {
      // Toggle off
      const newExpanded = { ...expandedTables }
      delete newExpanded[key]
      setExpandedTables(newExpanded)
      return
    }

    try {
      const response = await fetch(
        `${PROXY_API}/api/trino/schemas/${encodeURIComponent(schema)}/tables/${encodeURIComponent(table)}/columns`
      )
      if (response.ok) {
        const data = await response.json()
        setExpandedTables({ ...expandedTables, [key]: data.columns })
      }
    } catch (error) {
      console.error('Failed to load columns:', error)
    }
  }

  const executeQuery = async () => {
    if (!query.trim()) return

    setLoading(true)
    setResult(null)

    try {
      const response = await fetch(`${PROXY_API}/api/trino/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }),
      })

      const data = await response.json()
      setResult(data)

      // Add to history
      if (!data.error) {
        setQueryHistory((prev) => [query, ...prev.filter((q) => q !== query)].slice(0, 10))
      }
    } catch (error) {
      setResult({
        columns: [],
        rows: [],
        row_count: 0,
        duration: '0s',
        error: error instanceof Error ? error.message : 'Failed to execute query',
      })
    } finally {
      setLoading(false)
    }
  }

  const insertTableReference = (schema: string, table: string) => {
    const ref = `iceberg."${schema}"."${table}"`
    setQuery((prev) => prev + (prev.endsWith(' ') || prev === '' ? '' : ' ') + ref)
  }

  const formatCellValue = (value: any): string => {
    if (value === null || value === undefined) return 'NULL'
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Query Console</h2>
          <p className="text-muted-foreground">
            Execute SQL queries against the federated data lake
          </p>
        </div>
        <button
          onClick={clearCache}
          disabled={clearingCache}
          className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 opacity-50 hover:opacity-100 transition-opacity"
          title="Clear credential cache"
        >
          <RefreshCw className={`w-3 h-3 ${clearingCache ? 'animate-spin' : ''}`} />
          {clearingCache ? 'Clearing...' : 'Clear Cache'}
        </button>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Schema Browser */}
        <div className="col-span-3">
          <Card className="h-[600px] overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Database className="w-4 h-4" />
                Schema Browser
              </CardTitle>
              <CardDescription>Click to explore tables</CardDescription>
            </CardHeader>
            <CardContent className="overflow-auto h-[500px]">
              {loadingSchemas ? (
                <div className="space-y-2">
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-full" />
                </div>
              ) : schemas ? (
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground mb-2">
                    {schemas.catalog}
                  </div>
                  {schemas.schemas
                    .filter((s) => s !== 'information_schema')
                    .map((schema) => (
                      <div key={schema}>
                        <button
                          onClick={() => loadTables(schema)}
                          className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded hover:bg-gray-100 text-sm"
                        >
                          {expandedSchemas[schema] ? (
                            <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ChevronRight className="w-3 h-3" />
                          )}
                          <Database className="w-3 h-3 text-blue-500" />
                          <span className="truncate" title={schema}>
                            {schema.length > 20 ? schema.substring(0, 20) + '...' : schema}
                          </span>
                        </button>

                        {expandedSchemas[schema] && (
                          <div className="ml-4 space-y-1">
                            {expandedSchemas[schema].tables.map((table) => (
                              <div key={table}>
                                <button
                                  onClick={() => loadColumns(schema, table)}
                                  onDoubleClick={() => insertTableReference(schema, table)}
                                  className="flex items-center gap-2 w-full text-left px-2 py-1 rounded hover:bg-gray-100 text-sm"
                                  title="Double-click to insert"
                                >
                                  {expandedTables[`${schema}.${table}`] ? (
                                    <ChevronDown className="w-3 h-3" />
                                  ) : (
                                    <ChevronRight className="w-3 h-3" />
                                  )}
                                  <TableIcon className="w-3 h-3 text-green-500" />
                                  {table}
                                </button>

                                {expandedTables[`${schema}.${table}`] && (
                                  <div className="ml-6 space-y-0.5">
                                    {expandedTables[`${schema}.${table}`].map((col, idx) => (
                                      <div
                                        key={idx}
                                        className="flex items-center gap-2 px-2 py-0.5 text-xs text-gray-600"
                                      >
                                        <Columns className="w-3 h-3 text-gray-400" />
                                        <span>{col.Column}</span>
                                        <Badge variant="outline" className="text-[10px] px-1">
                                          {col.Type}
                                        </Badge>
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
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                  <p>Failed to load schemas</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Query Editor and Results */}
        <div className="col-span-9 space-y-4">
          {/* Query Editor */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">SQL Query</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Enter your SQL query..."
                className="font-mono text-sm min-h-[120px]"
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    executeQuery()
                  }
                }}
              />
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  Press Ctrl+Enter to execute
                </div>
                <Button onClick={executeQuery} disabled={loading || !query.trim()}>
                  <Play className="w-4 h-4 mr-2" />
                  {loading ? 'Executing...' : 'Execute'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Results */}
          <Card className="min-h-[300px]">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Results</CardTitle>
                {result && !result.error && (
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <TableIcon className="w-3 h-3" />
                      {result.row_count} rows
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {result.duration}
                    </span>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : result ? (
                result.error ? (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-red-800">Query Error</h4>
                        <p className="text-sm text-red-600 mt-1 font-mono">{result.error}</p>
                      </div>
                    </div>
                  </div>
                ) : result.rows.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <TableIcon className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p>No results returned</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto border rounded-lg">
                    <Table>
                      <TableHeader className="sticky top-0 bg-gray-50">
                        <TableRow>
                          {result.columns.map((col, idx) => (
                            <TableHead key={idx} className="font-medium whitespace-nowrap">
                              {col}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.rows.map((row, rowIdx) => (
                          <TableRow key={rowIdx}>
                            {row.map((cell, cellIdx) => (
                              <TableCell
                                key={cellIdx}
                                className="font-mono text-xs max-w-[300px] truncate"
                                title={formatCellValue(cell)}
                              >
                                {formatCellValue(cell)}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Play className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p>Execute a query to see results</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Query History */}
          {queryHistory.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Recent Queries</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {queryHistory.map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => setQuery(q)}
                      className="w-full text-left px-3 py-2 rounded hover:bg-gray-100 text-sm font-mono truncate"
                      title={q}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
