import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { isPlatformAdmin } from '@/lib/platform-admin'
import { getCurrentProfile } from '@/lib/roles'
import NavMenu from '@/components/NavMenu'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const isAdmin = await isPlatformAdmin(supabase)
  const profile = await getCurrentProfile(supabase)

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="relative border-b border-surface-border bg-background">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/jobs" className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent" />
            <span className="text-lg font-semibold tracking-tight">BusinessOps</span>
          </Link>
          <NavMenu isAdmin={isAdmin} role={profile?.role ?? 'staff'} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
