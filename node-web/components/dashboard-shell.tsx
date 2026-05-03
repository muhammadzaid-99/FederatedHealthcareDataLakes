'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { storage } from '@/lib/api'
import { Sidebar } from '@/components/sidebar'
import { RefreshCw, User } from 'lucide-react'

interface DashboardShellProps {
  children: React.ReactNode
  title: string
  description?: string
  actions?: React.ReactNode
}

export function DashboardShell({ children, title, description, actions }: DashboardShellProps) {
  const router = useRouter()
  const [authed, setAuthed] = useState(false)
  const [username, setUsername] = useState<string | null>(null)

  useEffect(() => {
    const token = storage.getToken()
    if (!token) {
      router.push('/login')
      return
    }
    const userInfo = storage.getUserInfo()
    setUsername(userInfo?.username || userInfo?.email || null)
    setAuthed(true)
  }, [router])

  if (!authed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <RefreshCw className="h-8 w-8 text-blue-600 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      <div className="pl-[260px] transition-all duration-300">
        {/* Top Header */}
        <header className="sticky top-0 z-30 h-16 bg-white/80 backdrop-blur-md border-b border-slate-200">
          <div className="flex h-full items-center justify-between px-8">
            <div>
              <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
              {description && (
                <p className="text-sm text-slate-500">{description}</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              {actions}
              {username && (
                <div className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                  <User className="h-3.5 w-3.5" />
                  <span className="font-medium">{username}</span>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
