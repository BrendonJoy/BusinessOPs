import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile, isCompanyAccount } from '@/lib/roles'
import { generatePayrollPdf } from '@/lib/payroll-pdf'

export async function GET(request: Request) {
  const supabase = await createClient()
  const profile = await getCurrentProfile(supabase)
  if (!profile || !isCompanyAccount(profile.role)) {
    return new Response(null, { status: 403 })
  }

  const url = new URL(request.url)
  const from = url.searchParams.get('from') ?? ''
  const to = url.searchParams.get('to') ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return new Response('Invalid period', { status: 400 })
  }

  const result = await generatePayrollPdf(from, to)

  if (!result) {
    return new Response(null, { status: 404 })
  }

  return new Response(new Uint8Array(result.buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${result.filename}"`,
    },
  })
}
