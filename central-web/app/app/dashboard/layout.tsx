'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Hospital, Users, FileText, LogOut, Activity, Terminal } from 'lucide-react'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check authentication by making a test API call
    // Since we use httpOnly cookies, we can't check localStorage
    checkAuth()
  }, [router])

  const checkAuth = async () => {
    try {
      // Try to fetch hospitals - if cookie is valid, this will succeed
      const response = await fetch('http://localhost:8080/api/v1/admin/hospitals', {
        credentials: 'include'
      })
      
      if (!response.ok) {
        // Not authenticated - redirect to login
        router.push('/login')
        return
      }
      
      // Authenticated - show dashboard
      setLoading(false)
    } catch (error) {
      // Network error or not authenticated
      router.push('/login')
    }
  }

  const handleLogout = async () => {
    try {
      await fetch('http://localhost:8080/api/v1/auth/admin/logout', {
        method: 'POST',
        credentials: 'include'
      })
    } catch (error) {
      console.error('Logout error:', error)
    }
    router.push('/login')
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  const navItems = [
    { href: '/dashboard', icon: Activity, label: 'Overview' },
    { href: '/dashboard/pending', icon: Users, label: 'Pending Registrations' },
    { href: '/dashboard/hospitals', icon: Hospital, label: 'All Hospitals' },
    { href: '/dashboard/requests', icon: FileText, label: 'Data Requests' },
    { href: '/dashboard/query', icon: Terminal, label: 'Query Console' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                <Hospital className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">Central Control Plane</h1>
                <p className="text-xs text-gray-500">Admin Dashboard</p>
              </div>
            </div>
            <Button variant="ghost" onClick={handleLogout} className="gap-2">
              <LogOut className="w-4 h-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Navigation Tabs */}
        <nav className="flex space-x-4 mb-6 border-b border-gray-200">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-gray-600 hover:text-primary hover:border-b-2 hover:border-primary transition-colors"
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
