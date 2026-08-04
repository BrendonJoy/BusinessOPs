'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from '@/lib/auth/actions'

const LINKS = [
  { href: '/dashboard', label: 'Dashboard', companyOnly: true },
  { href: '/jobs', label: 'Jobs', companyOnly: false },
  { href: '/events', label: 'Events', companyOnly: false },
  { href: '/roster', label: 'Roster', companyOnly: false },
  { href: '/calendar', label: 'Calendar', companyOnly: false },
  { href: '/timesheet', label: 'Timesheet', companyOnly: false },
  { href: '/reports', label: 'Reports', companyOnly: false },
  { href: '/expenses', label: 'Expenses', companyOnly: true },
  { href: '/settings', label: 'Settings', companyOnly: false },
]

export default function NavMenu({
  isAdmin,
  role,
  canViewReports,
  reportsModuleEnabled,
  expensesModuleEnabled,
  timesheetsModuleEnabled,
  eventsModuleEnabled,
}: {
  isAdmin: boolean
  role: 'company' | 'staff'
  canViewReports: boolean
  reportsModuleEnabled: boolean
  expensesModuleEnabled: boolean
  timesheetsModuleEnabled: boolean
  eventsModuleEnabled: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()

  const isCompanyAccount = role === 'company'
  const visibleLinks = LINKS.filter((link) => {
    if (link.href === '/reports') return reportsModuleEnabled && (isCompanyAccount || canViewReports)
    if (link.href === '/expenses') return expensesModuleEnabled && isCompanyAccount
    if (link.href === '/timesheet') return timesheetsModuleEnabled
    if (link.href === '/events' || link.href === '/roster') return eventsModuleEnabled
    return isCompanyAccount || !link.companyOnly
  })
  const allLinks = isAdmin ? [...visibleLinks, { href: '/admin/feedback', label: 'Admin' }] : visibleLinks

  return (
    <>
      {/* Breaks at lg, not sm: with every module enabled this is eight links
          plus Sign out, which overflows the header on tablet widths. */}
      <nav className="hidden items-center gap-4 text-sm lg:flex">
        {allLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`font-medium hover:text-accent ${
              link.href === '/admin/feedback' ? 'text-accent' : ''
            }`}
          >
            {link.label}
          </Link>
        ))}
        <form action={signOut}>
          <button type="submit" className="text-muted hover:text-accent">
            Sign out
          </button>
        </form>
      </nav>

      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="Toggle menu"
        className="flex h-11 w-11 items-center justify-center rounded-md border border-surface-border lg:hidden"
      >
        <span className="flex flex-col gap-1">
          <span className="block h-0.5 w-5 bg-foreground" />
          <span className="block h-0.5 w-5 bg-foreground" />
          <span className="block h-0.5 w-5 bg-foreground" />
        </span>
      </button>

      {isOpen && (
        // z-50 to clear the chat widget's fixed z-40 button — on a short phone
        // the open menu runs far enough down the screen to reach it.
        <div className="absolute inset-x-0 top-full z-50 border-b border-surface-border bg-background lg:hidden">
          <nav className="flex flex-col gap-1 px-4 py-3 text-sm">
            {allLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsOpen(false)}
                className={`rounded-md px-2 py-3 font-medium hover:bg-surface ${
                  link.href === '/admin/feedback' ? 'text-accent' : ''
                } ${pathname === link.href ? 'bg-surface' : ''}`}
              >
                {link.label}
              </Link>
            ))}
            <form action={signOut}>
              <button
                type="submit"
                className="w-full rounded-md px-2 py-3 text-left text-muted hover:bg-surface"
              >
                Sign out
              </button>
            </form>
          </nav>
        </div>
      )}
    </>
  )
}
