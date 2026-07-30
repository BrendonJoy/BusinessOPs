import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBaseUrl } from '@/lib/url'
import { getCurrentProfile, isCompanyAccount } from '@/lib/roles'
import { formatMoney } from '@/lib/money'
import { CURRENCIES, PAY_CYCLE_LENGTHS, PAY_CYCLE_LENGTH_LABELS, WORKDAY_DAY_LABELS } from '@trade-assist/db'
import type { Company, CompanyInvite, Profile, StaffPermissions } from '@trade-assist/db'
import {
  regenerateCalendarToken,
  updateCompany,
  updateCompanyModules,
  updateTimesheetSettings,
  updateProfile,
  uploadCompanyLogo,
} from './actions'
import {
  inviteTeamMember,
  removeMember,
  revokeInvite,
  updateInvitePermissions,
  updateMemberPermissions,
} from './team-actions'
import ConfirmSubmitButton from '@/components/ConfirmSubmitButton'
import FileUploadButtons from '@/components/FileUploadButtons'

type ProfileWithCompany = Profile & { company: Company | null }

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const supabase = await createClient()

  const currentProfile = await getCurrentProfile(supabase)
  if (!currentProfile) redirect('/jobs')
  const isCompany = isCompanyAccount(currentProfile.role)

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

  let team: Profile[] = []
  let pendingInvites: CompanyInvite[] = []
  let payRatesByProfileId = new Map<string, number>()

  if (isCompany) {
    const { data: teamData } = await supabase
      .from('profiles')
      .select('*')
      .eq('company_id', profile.company_id)
      .order('created_at')
    team = (teamData ?? []) as Profile[]

    const { data: invitesData } = await supabase
      .from('company_invites')
      .select('*')
      .eq('company_id', profile.company_id)
      .is('accepted_at', null)
      .order('created_at', { ascending: false })
    pendingInvites = (invitesData ?? []) as CompanyInvite[]

    const { data: payRatesData } = await supabase
      .from('staff_pay_rates')
      .select('profile_id, pay_rate')
      .in(
        'profile_id',
        team.map((m) => m.id)
      )
    payRatesByProfileId = new Map((payRatesData ?? []).map((r) => [r.profile_id, Number(r.pay_rate)]))
  }

  const companyMember = team.find((m) => m.role === 'company')
  const staffMembers = team.filter((m) => m.role === 'staff')

  let myPayRate: number | null = null
  if (!isCompany) {
    const { data: myRateRow } = await supabase
      .from('staff_pay_rates')
      .select('pay_rate')
      .eq('profile_id', currentProfile.id)
      .maybeSingle()
    myPayRate = myRateRow ? Number(myRateRow.pay_rate) : null
  }

  return (
    <div className="flex max-w-xl flex-col gap-8">
      <h1 className="text-xl font-semibold">Settings</h1>

      {error && <p className="rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{error}</p>}

      {isCompany && (
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
      )}

      {isCompany && (
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
          <FileUploadButtons
            action={uploadCompanyLogo}
            accept="image/*"
            label="Upload logo"
            inputName="logo"
          />
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
            <label htmlFor="job_prefix" className="text-sm font-medium">
              Job number prefix
            </label>
            <input
              id="job_prefix"
              name="job_prefix"
              type="text"
              required
              maxLength={10}
              defaultValue={company?.job_prefix ?? 'JOB-'}
              className="w-40 rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
            <p className="text-xs text-muted">
              Applies to new jobs (e.g. {(company?.job_prefix ?? 'JOB-')}0042). The sequential number
              itself can&apos;t be edited, and existing jobs keep their current numbers.
            </p>
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
      )}

      {isCompany && (
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
      )}

      {isCompany && (
      <section className="rounded-lg border border-surface-border p-4">
        <h2 className="mb-4 text-sm font-medium">Modules</h2>
        <p className="mb-4 text-sm text-muted">
          Switch off any section your business doesn&apos;t use. Existing data is kept and reappears
          immediately if you switch a module back on.
        </p>
        <form action={updateCompanyModules} className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                name="modules_quotes_enabled"
                defaultChecked={company?.modules_quotes_enabled ?? true}
                className="h-4 w-4 rounded border-surface-border"
              />
              Quotes
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                name="modules_invoicing_enabled"
                defaultChecked={company?.modules_invoicing_enabled ?? true}
                className="h-4 w-4 rounded border-surface-border"
              />
              Invoicing
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                name="modules_expenses_enabled"
                defaultChecked={company?.modules_expenses_enabled ?? true}
                className="h-4 w-4 rounded border-surface-border"
              />
              Expenses
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                name="modules_reports_enabled"
                defaultChecked={company?.modules_reports_enabled ?? true}
                className="h-4 w-4 rounded border-surface-border"
              />
              Reports
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                name="modules_timesheets_enabled"
                defaultChecked={company?.modules_timesheets_enabled ?? true}
                className="h-4 w-4 rounded border-surface-border"
              />
              Timesheets
            </label>
          </div>
          <button
            type="submit"
            className="self-start rounded-md border border-surface-border px-3 py-1.5 text-sm font-medium hover:border-accent"
          >
            Save modules
          </button>
        </form>
      </section>
      )}

      {isCompany && (
      <section className="rounded-lg border border-surface-border p-4">
        <h2 className="mb-4 text-sm font-medium">Timesheets</h2>
        <form action={updateTimesheetSettings} className="flex flex-col gap-5">
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">
              Optionally require staff to be physically near a job&apos;s address to clock in or out.
            </p>
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                name="geofence_enabled"
                defaultChecked={company?.geofence_enabled ?? false}
                className="h-4 w-4 rounded border-surface-border"
              />
              Require staff to be within range of the job site to clock in/out
            </label>
            <div className="flex flex-col gap-1">
              <label htmlFor="geofence_radius_meters" className="text-xs font-medium">
                Radius (meters)
              </label>
              <input
                id="geofence_radius_meters"
                name="geofence_radius_meters"
                type="number"
                min="1"
                step="1"
                defaultValue={company?.geofence_radius_meters ?? 200}
                className="w-32 rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-surface-border pt-4">
            <p className="text-sm text-muted">
              Optionally limit staff clock in/out to set work days and hours.
            </p>
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                name="workday_enforced"
                defaultChecked={company?.workday_enforced ?? false}
                className="h-4 w-4 rounded border-surface-border"
              />
              Only allow clocking in/out within work-day hours
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label htmlFor="workday_start" className="text-xs font-medium">
                  Work day starts
                </label>
                <input
                  id="workday_start"
                  name="workday_start"
                  type="time"
                  defaultValue={(company?.workday_start ?? '07:00').slice(0, 5)}
                  className="w-36 rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="workday_end" className="text-xs font-medium">
                  Work day ends
                </label>
                <input
                  id="workday_end"
                  name="workday_end"
                  type="time"
                  defaultValue={(company?.workday_end ?? '17:00').slice(0, 5)}
                  className="w-36 rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium">Work days</span>
              <div className="flex flex-wrap gap-3">
                {([1, 2, 3, 4, 5, 6, 7] as const).map((day) => (
                  <label key={day} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      name="workday_days"
                      value={day}
                      defaultChecked={(company?.workday_days ?? [1, 2, 3, 4, 5]).includes(day)}
                      className="h-4 w-4 rounded border-surface-border"
                    />
                    {WORKDAY_DAY_LABELS[day]}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-surface-border pt-4">
            <p className="text-sm text-muted">
              Pay cycle for payroll reports. The cycle start date anchors when each cycle begins.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label htmlFor="pay_cycle_length" className="text-xs font-medium">
                  Pay cycle
                </label>
                <select
                  id="pay_cycle_length"
                  name="pay_cycle_length"
                  defaultValue={company?.pay_cycle_length ?? 'weekly'}
                  className="w-40 rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
                >
                  {PAY_CYCLE_LENGTHS.map((length) => (
                    <option key={length} value={length}>
                      {PAY_CYCLE_LENGTH_LABELS[length]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="pay_cycle_anchor" className="text-xs font-medium">
                  Cycle start date
                </label>
                <input
                  id="pay_cycle_anchor"
                  name="pay_cycle_anchor"
                  type="date"
                  defaultValue={company?.pay_cycle_anchor ?? ''}
                  className="w-44 rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="self-start rounded-md border border-surface-border px-3 py-1.5 text-sm font-medium hover:border-accent"
          >
            Save timesheet settings
          </button>
        </form>
      </section>
      )}

      {isCompany && (
      <section className="rounded-lg border border-surface-border p-4">
        <h2 className="mb-4 text-sm font-medium">Team</h2>

        {companyMember && (
          <div className="mb-4 rounded-md border border-surface-border bg-surface p-3 text-sm">
            <span className="font-medium">{companyMember.full_name ?? companyMember.email}</span>{' '}
            <span className="text-muted">— Company account (full access to everything)</span>
          </div>
        )}

        {staffMembers.length > 0 && (
          <div className="mb-4 flex flex-col gap-3">
            {staffMembers.map((member) => (
              <div key={member.id} className="rounded-md border border-surface-border p-3">
                <div className="mb-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">{member.full_name ?? member.email}</p>
                    <p className="text-xs text-muted">{member.email}</p>
                  </div>
                  <ConfirmSubmitButton
                    action={removeMember.bind(null, member.id)}
                    confirmMessage={`Remove ${member.full_name ?? member.email} from the team? They will lose access immediately.`}
                    className="text-xs text-muted hover:text-accent"
                  >
                    Remove
                  </ConfirmSubmitButton>
                </div>
                <PermissionToggles
                  member={{ ...member, pay_rate: payRatesByProfileId.get(member.id) ?? null }}
                  action={updateMemberPermissions.bind(null, member.id)}
                />
              </div>
            ))}
          </div>
        )}

        {pendingInvites.length > 0 && (
          <div className="mb-4 flex flex-col gap-3">
            <h3 className="text-xs font-semibold text-muted">Pending invites</h3>
            {pendingInvites.map((invite) => (
              <div key={invite.id} className="rounded-md border border-surface-border p-3">
                <div className="mb-3 flex items-center justify-between gap-4">
                  <p className="text-sm">{invite.email}</p>
                  <form action={revokeInvite.bind(null, invite.id)}>
                    <button type="submit" className="text-xs text-muted hover:text-accent">
                      Revoke
                    </button>
                  </form>
                </div>
                <PermissionToggles member={invite} action={updateInvitePermissions.bind(null, invite.id)} />
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
          <button
            type="submit"
            className="rounded-md border border-surface-border px-4 py-2 text-sm font-medium hover:border-accent"
          >
            Invite teammate
          </button>
        </form>
      </section>
      )}

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
          {!isCompany && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Hourly rate</label>
              <p className="rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-muted">
                {myPayRate !== null ? formatMoney(myPayRate, company?.currency ?? 'USD') : 'Not set'}
              </p>
            </div>
          )}
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

function PermissionToggles({
  member,
  action,
}: {
  member: StaffPermissions & { pay_rate: number | null }
  action: (formData: FormData) => void
}) {
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            name="can_view_all_jobs"
            defaultChecked={member.can_view_all_jobs}
            className="h-3.5 w-3.5 rounded border-surface-border"
          />
          View all company jobs
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            name="can_edit_jobs"
            defaultChecked={member.can_edit_jobs}
            className="h-3.5 w-3.5 rounded border-surface-border"
          />
          Edit jobs
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            name="can_log_expenses"
            defaultChecked={member.can_log_expenses}
            className="h-3.5 w-3.5 rounded border-surface-border"
          />
          Log expenses/costs
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            name="can_view_reports"
            defaultChecked={member.can_view_reports}
            className="h-3.5 w-3.5 rounded border-surface-border"
          />
          View reports
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            name="can_schedule"
            defaultChecked={member.can_schedule}
            className="h-3.5 w-3.5 rounded border-surface-border"
          />
          Scheduling
        </label>
      </div>
      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium">Quotes</label>
          <select
            name="quotes_access"
            defaultValue={member.quotes_access}
            className="rounded-md border border-surface-border bg-background px-2 py-1 text-xs focus:border-accent focus:outline-none"
          >
            <option value="hidden">Hidden</option>
            <option value="view">View</option>
            <option value="full">Full access</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium">Invoicing</label>
          <select
            name="invoices_access"
            defaultValue={member.invoices_access}
            className="rounded-md border border-surface-border bg-background px-2 py-1 text-xs focus:border-accent focus:outline-none"
          >
            <option value="hidden">Hidden</option>
            <option value="view">View</option>
            <option value="full">Full access</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium">Hourly pay rate</label>
          <input
            type="number"
            name="pay_rate"
            step="0.01"
            min="0"
            placeholder="Not set"
            defaultValue={member.pay_rate ?? ''}
            className="w-24 rounded-md border border-surface-border bg-background px-2 py-1 text-xs focus:border-accent focus:outline-none"
          />
        </div>
      </div>
      <button
        type="submit"
        className="self-start rounded-md border border-surface-border px-3 py-1.5 text-xs font-medium hover:border-accent"
      >
        Save permissions
      </button>
    </form>
  )
}
