'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkAuth()
  }, [router])

  const checkAuth = async () => {
    try {
      await api.getAllHospitals()
      setLoading(false)
    } catch (error) {
      router.push('/login')
    }
  }

  const handleLogout = async () => {
    try {
      await api.adminLogout()
    } catch (error) {
      console.error('Logout error:', error)
    }
    router.push('/login')
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <RefreshCw className="h-8 w-8 text-violet-600 animate-spin" />
      </div>
    )
  }

  // Derive page title from pathname
  const getPageTitle = () => {
    if (pathname === '/dashboard') return 'Overview'
    if (pathname.includes('/pending')) return 'Pending Approvals'
    if (pathname.includes('/hospitals')) return 'Hospitals'
    if (pathname.includes('/requests/')) return 'Request Details'
    if (pathname.includes('/requests')) return 'Data Requests'
    if (pathname.includes('/query')) return 'Query Console'
    return 'Dashboard'
  }

  const getPageDescription = () => {
    if (pathname === '/dashboard') return 'System overview and recent activity'
    if (pathname.includes('/pending')) return 'Review and approve hospital registrations'
    if (pathname.includes('/hospitals')) return 'Manage registered hospitals'
    if (pathname.includes('/requests/')) return 'View request details and hospital responses'
    if (pathname.includes('/requests')) return 'Monitor data access requests'
    if (pathname.includes('/query')) return 'Execute SQL queries across federated data'
    return ''
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar onLogout={handleLogout} />
      <div className="pl-[260px] transition-all duration-300">
        {/* Top Header */}
        <header className="sticky top-0 z-30 h-16 bg-white/80 backdrop-blur-md border-b border-slate-200">
          <div className="flex h-full items-center justify-between px-8">
            <div>
              <h1 className="text-lg font-semibold text-slate-900">{getPageTitle()}</h1>
              <p className="text-sm text-slate-500">{getPageDescription()}</p>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="p-8">{children}</main>
      </div>
    </div>
  )
}
