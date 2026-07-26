import Link from 'next/link'
import { signOut } from '@/lib/auth/actions'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-surface-border bg-background">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/jobs" className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent" />
            <span className="text-lg font-semibold tracking-tight">Trade Assist</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/jobs" className="font-medium hover:text-accent">
              Jobs
            </Link>
            <Link href="/calendar" className="font-medium hover:text-accent">
              Calendar
            </Link>
            <Link href="/reports" className="font-medium hover:text-accent">
              Reports
            </Link>
            <Link href="/expenses" className="font-medium hover:text-accent">
              Expenses
            </Link>
            <Link href="/settings" className="font-medium hover:text-accent">
              Settings
            </Link>
            <form action={signOut}>
              <button type="submit" className="text-muted hover:text-accent">
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
