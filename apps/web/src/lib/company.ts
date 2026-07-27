import type { createClient } from '@/lib/supabase/server'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export async function getCompanyCurrency(
  supabase: SupabaseClient
): Promise<{ currency: string; tax_label: string; default_tax_rate: number }> {
  const { data } = await supabase
    .from('profiles')
    .select('company:companies(currency, tax_label, default_tax_rate)')
    .single()

  const company = data?.company as unknown as
    | { currency: string; tax_label: string; default_tax_rate: number }
    | null

  return company ?? { currency: 'USD', tax_label: 'Tax', default_tax_rate: 0 }
}

export async function getCompanyInfo(
  supabase: SupabaseClient
): Promise<{ name: string; currency: string; gst_registered: boolean } | null> {
  const { data } = await supabase
    .from('profiles')
    .select('company:companies(name, currency, gst_registered)')
    .single()

  return (
    (data?.company as unknown as { name: string; currency: string; gst_registered: boolean } | null) ?? null
  )
}
