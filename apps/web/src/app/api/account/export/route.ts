import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile, isCompanyAccount } from '@/lib/roles'
import { buildAccountExport } from '@/lib/account-export'

/**
 * Data export, for the customer's own use and to service an access request.
 *
 * Company accounts only. A staff member's own data is visible to them in the
 * app; a full company export includes their colleagues' pay rates and the
 * business's finances, which is not theirs to take.
 */
export async function GET() {
  const supabase = await createClient()
  const profile = await getCurrentProfile(supabase)

  if (!profile) {
    return Response.json({ error: 'Not signed in' }, { status: 401 })
  }
  if (!isCompanyAccount(profile.role)) {
    return Response.json({ error: 'Only the company account can export data' }, { status: 403 })
  }

  const data = await buildAccountExport(supabase)
  const date = data.exported_at.slice(0, 10)

  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="businessops-export-${date}.json"`,
      // This is the whole business in one file. It should never sit in a shared
      // cache, and there is nothing here worth an intermediary keeping.
      'Cache-Control': 'no-store, private',
    },
  })
}
