'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
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
  History,
  Zap,
} from 'lucide-react'

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
      <div className="grid grid-cols-12 gap-6">
        {/* Schema Browser */}
        <div className="col-span-12 lg:col-span-3">
          <Card className="border border-slate-200 shadow-sm h-[calc(100vh-13rem)] flex flex-col">
            <CardHeader className="pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Database className="h-4 w-4 text-violet-500" />
                  Schema Browser
                </CardTitle>
                <button
                  onClick={clearCache}
                  disabled={clearingCache}
                  className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors"
                  title="Clear credential cache"
                >
                  <RefreshCw className={`w-3 h-3 ${clearingCache ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </CardHeader>
            <CardContent className="overflow-y-auto flex-1 p-3 scrollbar-thin">
              {loadingSchemas ? (
                <div className="space-y-2 p-1">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-7 w-full rounded" />)}
                </div>
              ) : schemas ? (
                <div className="space-y-0.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 px-2 mb-2">
                    {schemas.catalog}
                  </div>
                  {schemas.schemas
                    .filter((s) => s !== 'information_schema')
                    .map((schema) => (
                      <div key={schema}>
                        <button
                          onClick={() => loadTables(schema)}
                          className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-md hover:bg-slate-100 text-sm transition-colors group"
                        >
                          {expandedSchemas[schema] ? (
                            <ChevronDown className="h-3 w-3 text-slate-400" />
                          ) : (
                            <ChevronRight className="h-3 w-3 text-slate-400" />
                          )}
                          <Database className="h-3.5 w-3.5 text-violet-500" />
                          <span className="truncate text-slate-700 group-hover:text-slate-900"
                            title={schema}>
                            {schema.length > 22 ? schema.substring(0, 22) + '…' : schema}
                          </span>
                        </button>

                        {expandedSchemas[schema] && (
                          <div className="ml-5 border-l border-slate-200 pl-2 space-y-0.5 mt-0.5">
                            {expandedSchemas[schema].tables.map((table) => (
                              <div key={table}>
                                <button
                                  onClick={() => loadColumns(schema, table)}
                                  onDoubleClick={() => insertTableReference(schema, table)}
                                  className="flex items-center gap-2 w-full text-left px-2 py-1 rounded-md hover:bg-slate-100 text-sm transition-colors group"
                                  title="Double-click to insert"
                                >
                                  {expandedTables[`${schema}.${table}`] ? (
                                    <ChevronDown className="h-3 w-3 text-slate-400" />
                                  ) : (
                                    <ChevronRight className="h-3 w-3 text-slate-400" />
                                  )}
                                  <TableIcon className="h-3.5 w-3.5 text-emerald-500" />
                                  <span className="text-slate-600 group-hover:text-slate-900">{table}</span>
                                </button>

                                {expandedTables[`${schema}.${table}`] && (
                                  <div className="ml-5 border-l border-slate-200 pl-2 space-y-0">
                                    {expandedTables[`${schema}.${table}`].map((col, idx) => (
                                      <div
                                        key={idx}
                                        className="flex items-center gap-2 px-2 py-0.5 text-xs"
                                      >
                                        <Columns className="h-3 w-3 text-slate-400 shrink-0" />
                                        <span className="text-slate-600">{col.Column}</span>
                                        <span className="text-[10px] text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">
                                          {col.Type}
                                        </span>
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
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="rounded-xl bg-slate-100 p-3 mb-3">
                    <AlertCircle className="h-6 w-6 text-slate-400" />
                  </div>
                  <p className="text-sm text-slate-500">Failed to load schemas</p>
                  <button onClick={loadSchemas} className="text-xs text-violet-600 hover:underline mt-2">
                    Retry
                  </button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Query Editor and Results */}
        <div className="col-span-12 lg:col-span-9 space-y-5">
          {/* Editor */}
          <Card className="border border-slate-200 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" />
                  SQL Editor
                </CardTitle>
                <span className="text-xs text-slate-400">Ctrl+Enter to execute</span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Enter your SQL query..."
                className="font-mono text-sm min-h-[140px] border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 resize-y bg-slate-50/50"
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    executeQuery()
                  }
                }}
              />
              <div className="flex items-center justify-end p-3 border-t border-slate-100 bg-white">
                <Button
                  onClick={executeQuery}
                  disabled={loading || !query.trim()}
                  className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-sm"
                  size="sm"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" />
                      Executing…
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5 mr-2" />
                      Execute Query
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Results */}
          <Card className="border border-slate-200 shadow-sm min-h-[320px]">
            <CardHeader className="pb-3 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <TableIcon className="h-4 w-4 text-emerald-500" />
                  Results
                </CardTitle>
                {result && !result.error && (
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 text-xs text-slate-500">
                      <TableIcon className="h-3 w-3" />
                      {result.row_count} rows
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Clock className="h-3 w-3" />
                      {result.duration}
                    </span>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="space-y-2 p-4">
                  {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 w-full rounded" />)}
                </div>
              ) : result ? (
                result.error ? (
                  <div className="m-4 rounded-xl bg-red-50 border border-red-200 p-4">
                    <div className="flex items-start gap-3">
                      <div className="rounded-lg bg-red-100 p-1.5 mt-0.5">
                        <AlertCircle className="h-4 w-4 text-red-600" />
                      </div>
                      <div>
                        <h4 className="font-medium text-red-800 text-sm">Query Error</h4>
                        <p className="text-sm text-red-600 mt-1 font-mono leading-relaxed">{result.error}</p>
                      </div>
                    </div>
                  </div>
                ) : result.rows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="rounded-xl bg-slate-100 p-4 mb-3">
                      <TableIcon className="h-6 w-6 text-slate-400" />
                    </div>
                    <p className="text-sm font-medium text-slate-500">No results returned</p>
                    <p className="text-xs text-slate-400 mt-1">Query executed successfully but returned 0 rows</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto scrollbar-thin">
                    <Table>
                      <TableHeader className="sticky top-0">
                        <TableRow className="bg-slate-50 border-b border-slate-200">
                          {result.columns.map((col, idx) => (
                            <TableHead key={idx} className="text-xs font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                              {col}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.rows.map((row, rowIdx) => (
                          <TableRow key={rowIdx} className="hover:bg-slate-50/80">
                            {row.map((cell, cellIdx) => (
                              <TableCell
                                key={cellIdx}
                                className="font-mono text-xs max-w-[300px] truncate text-slate-600"
                                title={formatCellValue(cell)}
                              >
                                {cell === null || cell === undefined ? (
                                  <span className="text-slate-300 italic">NULL</span>
                                ) : (
                                  formatCellValue(cell)
                                )}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="rounded-xl bg-violet-100 p-4 mb-3">
                    <Play className="h-6 w-6 text-violet-500" />
                  </div>
                  <p className="text-sm font-medium text-slate-500">Execute a query to see results</p>
                  <p className="text-xs text-slate-400 mt-1">Use the SQL editor above or press Ctrl+Enter</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Query History */}
          {queryHistory.length > 0 && (
            <Card className="border border-slate-200 shadow-sm">
              <CardHeader className="pb-2 border-b border-slate-100">
                <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <History className="h-4 w-4 text-slate-400" />
                  Recent Queries
                </CardTitle>
              </CardHeader>
              <CardContent className="p-1">
                <div className="space-y-0.5">
                  {queryHistory.map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => setQuery(q)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 text-sm font-mono text-slate-600 truncate transition-colors"
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
