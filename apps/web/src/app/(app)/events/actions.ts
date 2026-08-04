'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/roles'
import { EVENT_DAY_TYPES, type EventDayType } from '@trade-assist/db'

function errorRedirect(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`)
}

async function requireCompanyId() {
  const supabase = await createClient()
  const profile = await getCurrentProfile(supabase)
  if (!profile) redirect('/login')
  return { supabase, companyId: profile.company_id }
}

function parseDayType(value: FormDataEntryValue | null): EventDayType {
  const raw = String(value ?? 'event')
  return (EVENT_DAY_TYPES as readonly string[]).includes(raw) ? (raw as EventDayType) : 'event'
}

export async function createEvent(formData: FormData) {
  const { supabase, companyId } = await requireCompanyId()

  const name = String(formData.get('name') ?? '').trim()
  if (!name) errorRedirect('/events/new', 'Give the event a name.')

  const venue = String(formData.get('venue') ?? '').trim() || null
  const notes = String(formData.get('notes') ?? '').trim() || null

  const { data, error } = await supabase
    .from('events')
    .insert({ company_id: companyId, name, venue, notes })
    .select('id')
    .single()

  // RLS allows the company account and any manager. A staff member reaching
  // this action gets the same refusal the database would give them.
  if (error) errorRedirect('/events/new', error.message)

  // A first day is optional but usual, and creating the event then landing on
  // an empty detail page is a worse first impression than one date already in.
  const firstDate = String(formData.get('first_date') ?? '').trim()
  if (firstDate) {
    await supabase.from('event_days').insert({
      event_id: data.id,
      company_id: companyId,
      day_date: firstDate,
      day_type: parseDayType(formData.get('first_day_type')),
    })
  }

  revalidatePath('/events')
  redirect(`/events/${data.id}`)
}

export async function addEventDay(eventId: string, formData: FormData) {
  const { supabase, companyId } = await requireCompanyId()

  const dayDate = String(formData.get('day_date') ?? '').trim()
  if (!dayDate) errorRedirect(`/events/${eventId}`, 'Pick a date.')

  const { error } = await supabase.from('event_days').insert({
    event_id: eventId,
    company_id: companyId,
    day_date: dayDate,
    day_type: parseDayType(formData.get('day_type')),
  })

  // The table has a unique constraint on (event, date, type), so adding the
  // same day twice is a duplicate-key error rather than a silent second row.
  if (error) {
    const message = error.code === '23505' ? 'That day is already on this event.' : error.message
    errorRedirect(`/events/${eventId}`, message)
  }

  revalidatePath(`/events/${eventId}`)
}

export async function removeEventDay(eventId: string, dayId: string) {
  const { supabase } = await requireCompanyId()

  // Shifts cascade from the day, so this can silently discard a roster.
  const { count } = await supabase
    .from('shifts')
    .select('id', { count: 'exact', head: true })
    .eq('event_day_id', dayId)

  if ((count ?? 0) > 0) {
    errorRedirect(
      `/events/${eventId}`,
      `That day still has ${count} shift${count === 1 ? '' : 's'} on it. Remove them first.`
    )
  }

  const { error } = await supabase.from('event_days').delete().eq('id', dayId)
  if (error) errorRedirect(`/events/${eventId}`, error.message)

  revalidatePath(`/events/${eventId}`)
}

export async function updateEvent(eventId: string, formData: FormData) {
  const { supabase } = await requireCompanyId()

  const name = String(formData.get('name') ?? '').trim()
  if (!name) errorRedirect(`/events/${eventId}`, 'Give the event a name.')

  const { error } = await supabase
    .from('events')
    .update({
      name,
      venue: String(formData.get('venue') ?? '').trim() || null,
      notes: String(formData.get('notes') ?? '').trim() || null,
    })
    .eq('id', eventId)

  if (error) errorRedirect(`/events/${eventId}`, error.message)

  revalidatePath(`/events/${eventId}`)
  revalidatePath('/events')
}

export async function deleteEvent(eventId: string) {
  const { supabase } = await requireCompanyId()

  const { count } = await supabase
    .from('shifts')
    .select('id', { count: 'exact', head: true })
    .not('event_day_id', 'is', null)
    .in(
      'event_day_id',
      (await supabase.from('event_days').select('id').eq('event_id', eventId)).data?.map((d) => d.id) ?? [
        '00000000-0000-0000-0000-000000000000',
      ]
    )

  if ((count ?? 0) > 0) {
    errorRedirect(
      `/events/${eventId}`,
      `This event still has ${count} shift${count === 1 ? '' : 's'} rostered. Remove them before deleting it.`
    )
  }

  const { error } = await supabase.from('events').delete().eq('id', eventId)
  if (error) errorRedirect(`/events/${eventId}`, error.message)

  revalidatePath('/events')
  redirect('/events')
}
