import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { isPlatformAdmin } from '@/lib/platform-admin'
import { getCurrentProfile, isCompanyAccount } from '@/lib/roles'
import { getCompanyModules } from '@/lib/company'
import { getDeletionState } from '@/lib/account-deletion'
import { eventsAvailable } from '@/lib/events'
import { formatDate, toYmd } from '@/lib/dates'
import { Button, Notice, buttonClasses, cardClasses } from '@/components/ui'
import NavMenu from '@/components/NavMenu'
import ChatWidget from '@/components/ChatWidget'
import { cancelAccountDeletion } from './settings/actions'

export default async function AppLayout({
  children,
  panel,
}: {
  children: React.ReactNode
  // Parallel route slot. Renders the intercepted job panel over the current
  // page during client-side navigation; renders nothing (see @panel/default)
  // on a direct load or refresh, so the full page shows instead.
  panel: React.ReactNode
}) {
  const supabase = await createClient()
  const isAdmin = await isPlatformAdmin(supabase)
  const profile = await getCurrentProfile(supabase)
  const modules = await getCompanyModules(supabase)
  const deletion = await getDeletionState(supabase)
  const eventsEnabled = await eventsAvailable(supabase)

  // Closed the moment deletion is requested, for everyone in the company, not
  // just the person who asked. Gating here rather than per-page means a route
  // added later cannot forget to check. The export endpoint sits outside this
  // layout and stays reachable, which is the point — leaving should not mean
  // losing the ability to take your records with you.
  if (deletion) {
    return (
      <div className="mx-auto flex min-h-full w-full max-w-lg flex-1 flex-col justify-center px-4 py-16">
        <div className={cardClasses()}>
          <h1 className="mb-1 text-xl font-semibold">This account is closing</h1>
          <p className="mb-4 text-sm text-muted">
            {/* Long form ("3 Sep 2026") rather than the numeric timestamp
                format used elsewhere. This date is the deadline for saving a
                business's records; it should not be readable as 9 March. */}
            Deletion was requested on {formatDate(toYmd(deletion.requestedAt))}. All data for this
            business will be permanently erased on{' '}
            <span className="font-medium text-foreground">
              {formatDate(toYmd(deletion.erasesAt))}
            </span>
            {deletion.daysRemaining > 0 && <> — {deletion.daysRemaining} days from now</>}.
          </p>

          <Notice className="mb-4">
            Download your data before then. Once erased it cannot be recovered, by us or by anyone.
          </Notice>

          {isCompanyAccount(profile?.role) ? (
            <div className="flex flex-col gap-3 sm:flex-row">
              {/* A plain anchor, not next/link: this is a file download from a
                  route handler, and client-side navigation would try to render
                  it as a page. */}
              <a href="/api/account/export" className={buttonClasses('secondary', 'md')} download>
                Download my data
              </a>
              <form action={cancelAccountDeletion}>
                <Button type="submit" variant="primary" className="w-full sm:w-auto">
                  Keep the account
                </Button>
              </form>
            </div>
          ) : (
            <p className="text-sm text-muted">
              Only the company account can cancel this or download the company&apos;s records.
              Speak to whoever manages your BusinessOps account.
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="relative border-b border-surface-border bg-background">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/jobs" className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent" />
            <span className="text-lg font-semibold tracking-tight">BusinessOps</span>
          </Link>
          <NavMenu
            isAdmin={isAdmin}
            role={profile?.role ?? 'staff'}
            canViewReports={Boolean(profile?.can_view_reports)}
            reportsModuleEnabled={modules.modules_reports_enabled}
            expensesModuleEnabled={modules.modules_expenses_enabled}
            timesheetsModuleEnabled={modules.modules_timesheets_enabled}
            eventsModuleEnabled={eventsEnabled}
          />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
      {panel}
      <ChatWidget />
    </div>
  );
}
