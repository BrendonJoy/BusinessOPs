'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

function errorRedirect(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`)
}

export async function createCustomer(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim() || null
  const phone = String(formData.get('phone') ?? '').trim() || null
  const address = String(formData.get('address') ?? '').trim() || null

  if (!name) errorRedirect('/customers', 'Customer name is required.')

  const supabase = await createClient()
  const { data: profile } = await supabase.from('profiles').select('company_id').single()
  if (!profile) errorRedirect('/customers', 'Could not determine your company.')

  const { error } = await supabase
    .from('customers')
    .insert({ company_id: profile.company_id, name, email, phone, address })

  if (error) errorRedirect('/customers', error.message)

  revalidatePath('/customers')
}

export async function updateCustomer(customerId: string, formData: FormData) {
  const name = String(formData.get('name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim() || null
  const phone = String(formData.get('phone') ?? '').trim() || null
  const address = String(formData.get('address') ?? '').trim() || null
  const notes = String(formData.get('notes') ?? '').trim() || null

  if (!name) errorRedirect(`/customers/${customerId}`, 'Customer name is required.')

  const supabase = await createClient()

  const { error } = await supabase
    .from('customers')
    .update({ name, email, phone, address, notes })
    .eq('id', customerId)

  if (error) errorRedirect(`/customers/${customerId}`, error.message)

  revalidatePath('/customers')
  revalidatePath(`/customers/${customerId}`)
}
