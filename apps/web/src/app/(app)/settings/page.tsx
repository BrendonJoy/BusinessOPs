import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBaseUrl } from '@/lib/url'
import { getCurrentProfile, isCompanyAdmin } from '@/lib/roles'
import { CURRENCIES } from '@trade-assist/db'
import type { Company, CompanyInvite, Profile } from '@trade-assist/db'
import { regenerateCalendarToken, updateCompany, updateProfile, uploadCompanyLogo } from './actions'
import { inviteTeamMember, removeMember, revokeInvite, updateMemberRole } from './team-actions'
import ConfirmSubmitButton from '@/components/ConfirmSubmitButton'

type ProfileWithCompany = Profile & { company: Company | null }

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const supabase = await createClient()

  const currentProfile = await getCurrentProfile(supabase)
  if (!currentProfile || !isCompanyAdmin(currentProfile.role)) redirect('/jobs')

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data } = await supabase
    .from('profiles')
    .select('*, company:companies(*)')
    .eq('id', user!.id)
    .single()

  const profile = data as unknown as ProfileWithCompany
  const company = profile.company
  const baseUrl = await getBaseUrl()
  const calendarFeedUrl = company ? `${baseUrl}/api/calendar/${company.calendar_token}` : null

  const { data: teamData } = await supabase
    .from('profiles')
    .select('*')
    .eq('company_id', profile.company_id)
    .order('created_at')

  const team = (teamData ?? []) as Profile[]

  const { data: invitesData } = await supabase
    .from('company_invites')
    .select('*')
    .eq('company_id', profile.company_id)
    .is('accepted_at', null)
    .order('created_at', { ascending: false })

  const pendingInvites = (invitesData ?? []) as CompanyInvite[]

  return (
    <div className="flex max-w-xl flex-col gap-8">
      <h1 className="text-xl font-semibold">Settings</h1>

      {error && <p className="rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{error}</p>}

      <section className="rounded-lg border border-surface-border p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium">Customer details</h2>
            <p className="text-sm text-muted">View, add, and update your saved customers.</p>
          </div>
          <Link
            href="/customers"
            className="rounded-md border border-surface-border px-4 py-2 text-sm font-medium hover:border-accent"
          >
            Customer Details
          </Link>
        </div>
      </section>

      <section className="rounded-lg border border-surface-border p-4">
        <h2 className="mb-4 text-sm font-medium">Company</h2>

        <div className="mb-4 flex flex-wrap items-center gap-4">
          {company?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={company.logo_url}
              alt="Company logo"
              className="h-16 w-16 rounded-md bg-surface object-contain"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-md bg-surface text-xs text-muted">
              No logo
            </div>
          )}
          <form action={uploadCompanyLogo} className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              name="logo"
              accept="image/*"
              required
              className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-surface file:px-3 file:py-2 file:text-sm"
            />
            <button
              type="submit"
              className="rounded-md border border-surface-border px-3 py-1.5 text-sm font-medium hover:border-accent"
            >
              Upload
            </button>
          </form>
        </div>

        <form action={updateCompany} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="name" className="text-sm font-medium">
              Company name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              defaultValue={company?.name ?? ''}
              className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="gst_number" className="text-sm font-medium">
              GST / tax number
            </label>
            <input
              id="gst_number"
              name="gst_number"
              type="text"
              defaultValue={company?.gst_number ?? ''}
              className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="address" className="text-sm font-medium">
              Business address
            </label>
            <textarea
              id="address"
              name="address"
              rows={2}
              defaultValue={company?.address ?? ''}
              className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="gst_registered"
              name="gst_registered"
              type="checkbox"
              defaultChecked={company?.gst_registered ?? true}
              className="h-4 w-4 rounded border-surface-border"
            />
            <label htmlFor="gst_registered" className="text-sm font-medium">
              GST / tax registered
            </label>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="currency" className="text-sm font-medium">
              Currency
            </label>
            <select
              id="currency"
              name="currency"
              defaultValue={company?.currency ?? 'USD'}
              className="max-w-xs rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="tax_label" className="text-sm font-medium">
                Tax label
              </label>
              <input
                id="tax_label"
                name="tax_label"
                type="text"
                placeholder="GST, VAT, Sales Tax…"
                defaultValue={company?.tax_label ?? 'Tax'}
                className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="default_tax_rate" className="text-sm font-medium">
                Default tax rate (%)
              </label>
              <input
                id="default_tax_rate"
                name="default_tax_rate"
                type="number"
                step="0.01"
                min="0"
                max="100"
                defaultValue={company?.default_tax_rate ?? 0}
                className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="payment_details" className="text-sm font-medium">
              Payment details
            </label>
            <textarea
              id="payment_details"
              name="payment_details"
              rows={3}
              placeholder="Bank name, account name, account number/IBAN, etc. — shown on every invoice."
              defaultValue={company?.payment_details ?? ''}
              className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="self-start rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
          >
            Save company details
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-surface-border p-4">
        <h2 className="mb-2 text-sm font-medium">Calendar subscription</h2>
        <p className="mb-3 text-sm text-muted">
          Subscribe to this URL in Google Calendar, Outlook, or Apple Calendar to see your jobs
          alongside your personal calendar. It updates automatically — no login needed, but treat
          the link like a password since anyone with it can view your job schedule.
        </p>
        {calendarFeedUrl && (
          <p className="mb-3 break-all rounded-md bg-surface px-3 py-2 text-sm">{calendarFeedUrl}</p>
        )}
        <form action={regenerateCalendarToken}>
          <button
            type="submit"
            className="rounded-md border border-surface-border px-3 py-1.5 text-sm font-medium hover:border-accent"
          >
            Regenerate link
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-surface-border p-4">
        <h2 className="mb-4 text-sm font-medium">Team</h2>

        <div className="mb-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="py-1 font-medium">Name</th>
                <th className="py-1 font-medium">Email</th>
                <th className="py-1 font-medium">Role</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {team.map((member) => (
                <tr key={member.id} className="border-t border-surface-border">
                  <td className="py-2">{member.full_name ?? '—'}</td>
                  <td className="py-2">{member.email}</td>
                  <td className="py-2 capitalize">
                    {member.role === 'owner' ? (
                      'Owner'
                    ) : (
                      <form action={updateMemberRole.bind(null, member.id)} className="flex items-center gap-2">
                        <select
                          name="role"
                          defaultValue={member.role}
                          className="rounded-md border border-surface-border bg-background px-2 py-1 text-xs focus:border-accent focus:outline-none"
                        >
                          <option value="admin">Admin</option>
                          <option value="staff">Staff</option>
                        </select>
                        <button type="submit" className="text-xs text-muted hover:text-accent">
                          Update
                        </button>
                      </form>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {member.role !== 'owner' && (
                      <ConfirmSubmitButton
                        action={removeMember.bind(null, member.id)}
                        confirmMessage={`Remove ${member.full_name ?? member.email} from the team? They will lose access immediately.`}
                        className="text-xs text-muted hover:text-accent"
                      >
                        Remove
                      </ConfirmSubmitButton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pendingInvites.length > 0 && (
          <div className="mb-4 flex flex-col gap-2">
            <h3 className="text-xs font-semibold text-muted">Pending invites</h3>
            {pendingInvites.map((invite) => (
              <div
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-surface-border p-2 text-sm"
              >
                <span>
                  {invite.email} <span className="capitalize text-muted">— {invite.role}</span>
                </span>
                <form action={revokeInvite.bind(null, invite.id)}>
                  <button type="submit" className="text-xs text-muted hover:text-accent">
                    Revoke
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}

        <form action={inviteTeamMember} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="invite_email" className="text-xs font-medium">
              Email
            </label>
            <input
              id="invite_email"
              name="email"
              type="email"
              required
              className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="invite_role" className="text-xs font-medium">
              Role
            </label>
            <select
              id="invite_role"
              name="role"
              defaultValue="staff"
              className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            >
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button
            type="submit"
            className="rounded-md border border-surface-border px-4 py-2 text-sm font-medium hover:border-accent"
          >
            Invite teammate
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-surface-border p-4">
        <h2 className="mb-4 text-sm font-medium">Your profile</h2>
        <form action={updateProfile} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="full_name" className="text-sm font-medium">
              Name
            </label>
            <input
              id="full_name"
              name="full_name"
              type="text"
              defaultValue={profile.full_name ?? ''}
              className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Email</label>
            <p className="rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-muted">
              {user?.email}
            </p>
          </div>
          <button
            type="submit"
            className="self-start rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
          >
            Save profile
          </button>
        </form>
      </section>
    </div>
  )
}
