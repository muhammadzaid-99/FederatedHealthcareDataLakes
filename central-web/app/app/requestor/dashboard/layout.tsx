'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { requestorApi, Requestor } from '@/lib/requestor_api'
import { 
  FlaskConical, 
  LayoutDashboard, 
  FileText, 
  PlusCircle, 
  Terminal, 
  LogOut,
  User
} from 'lucide-react'

export default function RequestorDashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [loading, setLoading] = useState(true)
  const [requestor, setRequestor] = useState<Requestor | null>(null)

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const data = await requestorApi.getProfile()
      setRequestor(data.requestor)
      setLoading(false)
    } catch (error) {
      router.push('/requestor/login')
    }
  }

  const handleLogout = async () => {
    try {
      await requestorApi.logout()
    } catch (error) {
      console.error('Logout error:', error)
    }
    router.push('/requestor/login')
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  const navItems = [
    { href: '/requestor/dashboard', icon: LayoutDashboard, label: 'Overview' },
    { href: '/requestor/dashboard/requests', icon: FileText, label: 'My Requests' },
    { href: '/requestor/dashboard/requests/new', icon: PlusCircle, label: 'New Request' },
    { href: '/requestor/dashboard/query', icon: Terminal, label: 'Query Console' },
  ]

  const isActive = (href: string) => {
    if (href === '/requestor/dashboard') {
      return pathname === href
    }
    return pathname.startsWith(href)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
                <FlaskConical className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">Researcher Portal</h1>
                <p className="text-xs text-gray-500">Data Access Dashboard</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {requestor && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <User className="w-4 h-4" />
                  <span>{requestor.name}</span>
                  {requestor.organization && (
                    <span className="text-gray-400">({requestor.organization})</span>
                  )}
                </div>
              )}
              <Button variant="ghost" onClick={handleLogout} className="gap-2">
                <LogOut className="w-4 h-4" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Navigation Tabs */}
        <nav className="flex space-x-1 mb-6 border-b border-gray-200">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  active
                    ? 'text-indigo-600 border-indigo-600'
                    : 'text-gray-600 border-transparent hover:text-indigo-600 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            )
          })}
        </nav>

        {/* Content */}
        <main>{children}</main>
      </div>
    </div>
  )
}
