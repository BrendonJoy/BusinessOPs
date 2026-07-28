'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from '@/lib/auth/actions'

const LINKS = [
  { href: '/dashboard', label: 'Dashboard', companyOnly: true },
  { href: '/jobs', label: 'Jobs', companyOnly: false },
  { href: '/calendar', label: 'Calendar', companyOnly: false },
  { href: '/reports', label: 'Reports', companyOnly: false },
  { href: '/expenses', label: 'Expenses', companyOnly: true },
  { href: '/settings', label: 'Settings', companyOnly: true },
  { href: '/feedback', label: 'Feedback', companyOnly: false },
]

export default function NavMenu({
  isAdmin,
  role,
  canViewReports,
}: {
  isAdmin: boolean
  role: 'company' | 'staff'
  canViewReports: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()

  const isCompanyAccount = role === 'company'
  const visibleLinks = LINKS.filter((link) => {
    if (link.href === '/reports') return isCompanyAccount || canViewReports
    return isCompanyAccount || !link.companyOnly
  })
  const allLinks = isAdmin ? [...visibleLinks, { href: '/admin/feedback', label: 'Admin' }] : visibleLinks

  return (
    <>
      <nav className="hidden items-center gap-4 text-sm sm:flex">
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
        className="flex h-9 w-9 items-center justify-center rounded-md border border-surface-border sm:hidden"
      >
        <span className="flex flex-col gap-1">
          <span className="block h-0.5 w-5 bg-foreground" />
          <span className="block h-0.5 w-5 bg-foreground" />
          <span className="block h-0.5 w-5 bg-foreground" />
        </span>
      </button>

      {isOpen && (
        <div className="absolute inset-x-0 top-full z-20 border-b border-surface-border bg-background sm:hidden">
          <nav className="flex flex-col gap-1 px-4 py-3 text-sm">
            {allLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsOpen(false)}
                className={`rounded-md px-2 py-2 font-medium hover:bg-surface ${
                  link.href === '/admin/feedback' ? 'text-accent' : ''
                } ${pathname === link.href ? 'bg-surface' : ''}`}
              >
                {link.label}
              </Link>
            ))}
            <form action={signOut}>
              <button
                type="submit"
                className="w-full rounded-md px-2 py-2 text-left text-muted hover:bg-surface"
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
