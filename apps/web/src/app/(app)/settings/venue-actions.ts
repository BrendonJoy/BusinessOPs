'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile, isCompanyAccount } from '@/lib/roles'
import { geocodeAddress } from '@/lib/google-maps'

function errorRedirect(message: string): never {
  redirect(`/settings?error=${encodeURIComponent(message)}`)
}

async function requireCompany() {
  const supabase = await createClient()
  const profile = await getCurrentProfile(supabase)
  if (!profile || !isCompanyAccount(profile.role)) {
    errorRedirect('Only the company account can change venues.')
  }
  return { supabase, profile }
}

/**
 * Coordinates are resolved from the address here, on the server, using the same
 * geocoder job addresses use — the browser never talks to Google.
 *
 * A failed lookup is not an error. The venue is still worth having for its name,
 * and the UI says plainly that clock-in cannot be fenced without coordinates.
 * Refusing to save the venue because Google did not recognise a loading dock
 * would be the wrong trade.
 */
async function resolveCoordinates(address: string | null) {
  if (!address) return { geo_lat: null, geo_lng: null }
  const point = await geocodeAddress(address)
  return { geo_lat: point?.lat ?? null, geo_lng: point?.lng ?? null }
}

export async function createVenue(formData: FormData) {
  const { supabase, profile } = await requireCompany()

  const name = String(formData.get('name') ?? '').trim()
  if (!name) errorRedirect('Give the venue a name.')

  const address = String(formData.get('address') ?? '').trim() || null

  const { error } = await supabase.from('venues').insert({
    company_id: profile.company_id,
    name,
    address,
    ...(await resolveCoordinates(address)),
  })

  if (error) errorRedirect(error.message)

  revalidatePath('/settings')
}

export async function updateVenue(venueId: string, formData: FormData) {
  const { supabase } = await requireCompany()

  const name = String(formData.get('name') ?? '').trim()
  if (!name) errorRedirect('Give the venue a name.')

  const address = String(formData.get('address') ?? '').trim() || null

  // Re-geocoded on every save rather than only when the text changes: the
  // address is the source of truth, and stale coordinates would fence people
  // out of the wrong building without anything on screen looking wrong.
  const { error } = await supabase
    .from('venues')
    .update({ name, address, ...(await resolveCoordinates(address)) })
    .eq('id', venueId)

  if (error) errorRedirect(error.message)

  revalidatePath('/settings')
}

export async function deleteVenue(venueId: string) {
  const { supabase } = await requireCompany()

  // Events and shifts reference venues with `on delete set null`, so deleting
  // one silently unfences every shift pointing at it. Refuse while anything
  // still uses it rather than quietly turning off a control.
  const [{ count: eventCount }, { count: shiftCount }] = await Promise.all([
    supabase.from('events').select('id', { count: 'exact', head: true }).eq('venue_id', venueId),
    supabase.from('shifts').select('id', { count: 'exact', head: true }).eq('venue_id', venueId),
  ])

  const inUse = (eventCount ?? 0) + (shiftCount ?? 0)
  if (inUse > 0) {
    errorRedirect(
      `That venue is still used by ${inUse} event${inUse === 1 ? '' : 's'} or shift${inUse === 1 ? '' : 's'}. Point them elsewhere first.`
    )
  }

  const { error } = await supabase.from('venues').delete().eq('id', venueId)
  if (error) errorRedirect(error.message)

  revalidatePath('/settings')
}
