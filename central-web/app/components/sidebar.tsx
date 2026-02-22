'use client'

import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  UserCheck,
  Building2,
  FileText,
  Terminal,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Shield,
} from 'lucide-react'
import { useState } from 'react'

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Overview' },
  { href: '/dashboard/pending', icon: UserCheck, label: 'Pending Approvals' },
  { href: '/dashboard/hospitals', icon: Building2, label: 'Hospitals' },
  { href: '/dashboard/requests', icon: FileText, label: 'Data Requests' },
  // { href: '/dashboard/query', icon: Terminal, label: 'Query Console' },
]

interface SidebarProps {
  onLogout: () => void
}

export function Sidebar({ onLogout }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen flex flex-col bg-slate-900 text-white transition-all duration-300 ease-in-out border-r border-slate-800',
        collapsed ? 'w-[72px]' : 'w-[260px]'
      )}
    >
      {/* Logo */}
      <div className={cn(
        'flex items-center h-16 px-4 border-b border-slate-800',
        collapsed ? 'justify-center' : 'gap-3'
      )}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600">
          <Shield className="h-5 w-5 text-white" />
        </div>
        {!collapsed && (
          <div className="flex flex-col overflow-hidden">
            <span className="text-sm font-semibold text-white truncate">HMS Central</span>
            <span className="text-[11px] text-slate-400 truncate">Control Plane</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        <div className={cn('mb-3 px-3', collapsed && 'hidden')}>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Navigation
          </span>
        </div>
        {navItems.map((item) => {
          const Icon = item.icon
          const active = isActive(item.href)
          return (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={cn(
                'group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
                active
                  ? 'bg-violet-600/20 text-violet-300 shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white',
                collapsed && 'justify-center px-2'
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className={cn(
                'h-5 w-5 shrink-0 transition-colors',
                active ? 'text-violet-400' : 'text-slate-500 group-hover:text-slate-300'
              )} />
              {!collapsed && <span className="truncate">{item.label}</span>}
              {active && !collapsed && (
                <div className="ml-auto h-1.5 w-1.5 rounded-full bg-violet-400" />
              )}
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-800 p-3 space-y-1">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-all duration-150',
            collapsed && 'justify-center px-2'
          )}
        >
          {collapsed ? (
            <ChevronRight className="h-5 w-5 shrink-0" />
          ) : (
            <>
              <ChevronLeft className="h-5 w-5 shrink-0" />
              <span>Collapse</span>
            </>
          )}
        </button>
        <button
          onClick={onLogout}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all duration-150',
            collapsed && 'justify-center px-2'
          )}
          title={collapsed ? 'Logout' : undefined}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  )
}

export function useSidebarWidth() {
  return { expanded: 260, collapsed: 72 }
}
