import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBaseUrl } from '@/lib/url'
import { getCurrentProfile, isCompanyAccount } from '@/lib/roles'
import { formatMoney } from '@/lib/money'
import { CURRENCIES, PAY_CYCLE_LENGTHS, PAY_CYCLE_LENGTH_LABELS, WORKDAY_DAY_LABELS } from '@trade-assist/db'
import type { Company, CompanyInvite, PayType, Profile, StaffPermissions } from '@trade-assist/db'
import { DELETION_GRACE_DAYS } from '@/lib/account-deletion'
import {
  regenerateCalendarToken,
  requestAccountDeletion,
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
import PayFields from './PayFields'
import {
  addTeamMember,
  createTeam,
  deleteTeam,
  removeTeamMember,
  renameTeam,
  updateTeamMemberRole,
} from './department-actions'
import FileUploadButtons from '@/components/FileUploadButtons'
import {
  Button,
  EmptyState,
  Field,
  Input,
  Select,
  buttonClasses,
  cardClasses,
  checkboxClasses,
  inputClasses,
} from '@/components/ui'

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
  let payByProfileId = new Map<string, { rate: number | null; type: PayType }>()

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
      .select('profile_id, pay_rate, pay_type')
      .in(
        'profile_id',
        team.map((m) => m.id)
      )
    // A salaried row carries a null rate, so the rate cannot be coerced with
    // Number() here — that would turn "salaried" into a rate of zero.
    payByProfileId = new Map(
      (payRatesData ?? []).map((r) => [
        r.profile_id as string,
        {
          rate: r.pay_rate === null ? null : Number(r.pay_rate),
          type: r.pay_type as PayType,
        },
      ])
    )
  }

  // Departments only matter once the events module is on — they exist to scope
  // rostering and pay-rate visibility, neither of which BusinessOps has.
  const eventsEnabled = company?.modules_events_enabled ?? false

  let departments: { id: string; name: string }[] = []
  let memberships: { team_id: string; profile_id: string; role: 'manager' | 'staff' }[] = []

  if (isCompany && eventsEnabled) {
    const [{ data: teamsData }, { data: membershipData }] = await Promise.all([
      supabase.from('teams').select('id, name').eq('company_id', profile.company_id).order('name'),
      supabase.from('team_memberships').select('team_id, profile_id, role'),
    ])
    departments = (teamsData ?? []) as { id: string; name: string }[]
    memberships = (membershipData ?? []) as typeof memberships
  }

  const companyMember = team.find((m) => m.role === 'company')
  const staffMembers = team.filter((m) => m.role === 'staff')

  let myPay: { rate: number | null; type: PayType } | null = null
  if (!isCompany) {
    const { data: myRateRow } = await supabase
      .from('staff_pay_rates')
      .select('pay_rate, pay_type')
      .eq('profile_id', currentProfile.id)
      .maybeSingle()
    myPay = myRateRow
      ? {
          rate: myRateRow.pay_rate === null ? null : Number(myRateRow.pay_rate),
          type: myRateRow.pay_type as PayType,
        }
      : null
  }

  return (
    <div className="flex max-w-xl flex-col gap-8">
      <h1 className="text-xl font-semibold">Settings</h1>

      {error && <p className="rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{error}</p>}

      {isCompany && (
      <section className={cardClasses()}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium">Customer details</h2>
            <p className="text-sm text-muted">View, add, and update your saved customers.</p>
          </div>
          <Link
            href="/customers"
            className={buttonClasses()}
          >
            Customer Details
          </Link>
        </div>
      </section>
      )}

      {isCompany && (
      <section className={cardClasses()}>
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
              className={inputClasses()}
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
              className={inputClasses()}
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
              className={inputClasses()}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="gst_registered"
              name="gst_registered"
              type="checkbox"
              defaultChecked={company?.gst_registered ?? true}
              className={checkboxClasses()}
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
              className={inputClasses('md', 'max-w-xs')}
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
                className={inputClasses()}
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
                className={inputClasses()}
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
              className={inputClasses('md', 'w-40')}
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
              className={inputClasses()}
            />
          </div>
          <button
            type="submit"
            className={buttonClasses('primary', 'md', 'self-start')}
          >
            Save company details
          </button>
        </form>
      </section>
      )}

      {isCompany && (
      <section className={cardClasses()}>
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
            className={buttonClasses('secondary', 'sm')}
          >
            Regenerate link
          </button>
        </form>
      </section>
      )}

      {isCompany && (
      <section className={cardClasses()}>
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
                className={checkboxClasses()}
              />
              Quotes
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                name="modules_invoicing_enabled"
                defaultChecked={company?.modules_invoicing_enabled ?? true}
                className={checkboxClasses()}
              />
              Invoicing
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                name="modules_expenses_enabled"
                defaultChecked={company?.modules_expenses_enabled ?? true}
                className={checkboxClasses()}
              />
              Expenses
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                name="modules_reports_enabled"
                defaultChecked={company?.modules_reports_enabled ?? true}
                className={checkboxClasses()}
              />
              Reports
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                name="modules_timesheets_enabled"
                defaultChecked={company?.modules_timesheets_enabled ?? true}
                className={checkboxClasses()}
              />
              Timesheets
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                name="modules_events_enabled"
                defaultChecked={company?.modules_events_enabled ?? false}
                className={checkboxClasses()}
              />
              Events &amp; rostering
            </label>
          </div>
          <button
            type="submit"
            className={buttonClasses('secondary', 'md', 'self-start')}
          >
            Save modules
          </button>
        </form>
      </section>
      )}

      {isCompany && (
      <section className={cardClasses()}>
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
                className={checkboxClasses()}
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
                className={inputClasses('md', 'w-32')}
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
                className={checkboxClasses()}
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
                  className={inputClasses('md', 'w-36')}
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
                  className={inputClasses('md', 'w-36')}
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
                      className={checkboxClasses()}
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
                  className={inputClasses('md', 'w-40')}
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
                  className={inputClasses('md', 'w-44')}
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            className={buttonClasses('secondary', 'md', 'self-start')}
          >
            Save timesheet settings
          </button>
        </form>
      </section>
      )}

      {isCompany && (
      <section className={cardClasses()}>
        <h2 className="mb-4 text-sm font-medium">Team</h2>

        {companyMember && (
          <div className="mb-4 rounded-md border border-surface-border bg-surface p-3 text-sm">
            <span className="font-medium">{companyMember.full_name ?? companyMember.email}</span>{' '}
            {/* "Access level", not "role" — role reads as job role, which is
                exactly the confusion job_title now resolves. */}
            <span className="text-muted">— Access level: Company (full access to everything)</span>
          </div>
        )}

        {staffMembers.length === 0 && pendingInvites.length === 0 && (
          <EmptyState
            title="No team members yet"
            description="Invite someone below. Once they accept, you'll be able to set their job title, hourly pay rate and exactly what they can see and do — all from here."
          />
        )}

        {staffMembers.length > 0 && (
          <div className="mb-4 flex flex-col gap-3">
            {staffMembers.map((member) => (
              <div key={member.id} className="rounded-md border border-surface-border p-3">
                <div className="mb-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">
                      {member.full_name ?? member.email}
                      {member.job_title && (
                        <span className="ml-2 font-normal text-muted">{member.job_title}</span>
                      )}
                    </p>
                    <p className="text-xs text-muted">{member.email} — Access level: Staff</p>
                  </div>
                  <ConfirmSubmitButton
                    action={removeMember.bind(null, member.id)}
                    confirmMessage={`Remove ${member.full_name ?? member.email} from the team? They will lose access immediately.`}
                    className="text-xs text-muted hover:text-accent"
                  >
                    Remove
                  </ConfirmSubmitButton>
                </div>
                <MemberEditor
                  member={{
                    ...member,
                    pay_rate: payByProfileId.get(member.id)?.rate ?? null,
                    pay_type: payByProfileId.get(member.id)?.type ?? null,
                  }}
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
                <MemberEditor member={invite} action={updateInvitePermissions.bind(null, invite.id)} />
              </div>
            ))}
          </div>
        )}

        <form
          action={inviteTeamMember}
          className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
        >
          <Field label="Email" htmlFor="invite_email" required className="min-w-[200px] flex-1">
            <Input id="invite_email" name="email" type="email" required />
          </Field>
          {/* No hint here: it would make this field taller than the email one,
              and sm:items-end then knocks the two labels out of line. The
              placeholder already conveys that it's optional. */}
          <Field label="Job title" htmlFor="invite_job_title">
            <Input
              id="invite_job_title"
              name="job_title"
              type="text"
              placeholder="Electrician, Apprentice…"
            />
          </Field>
          <Button type="submit" className="w-full sm:w-auto">
            Invite teammate
          </Button>
        </form>
      </section>
      )}

      <section className={cardClasses()}>
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
              className={inputClasses()}
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
              <label className="text-sm font-medium">Pay</label>
              <p className="rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-muted">
                {myPay?.type === 'salaried'
                  ? 'Salaried'
                  : myPay?.rate != null
                    ? `${formatMoney(myPay.rate, company?.currency ?? 'USD')} / hour`
                    : 'Not set'}
              </p>
            </div>
          )}
          <button
            type="submit"
            className={buttonClasses('primary', 'md', 'self-start')}
          >
            Save profile
          </button>
        </form>
      </section>

      {isCompany && eventsEnabled && (
      <section className={cardClasses()}>
        <h2 className="mb-1 text-sm font-medium">Departments</h2>
        <p className="mb-4 text-sm text-muted">
          Departments are how rostering is divided up. A manager schedules their own department and
          can see its pay rates; they can&apos;t see another department&apos;s. People can belong to
          more than one.
        </p>

        {departments.length === 0 ? (
          <EmptyState
            title="No departments yet"
            description="Add one below — catering, operations, bar. You'll pick a department for every shift you create."
          />
        ) : (
          <div className="flex flex-col gap-4">
            {departments.map((dept) => {
              const members = memberships.filter((m) => m.team_id === dept.id)
              const memberIds = new Set(members.map((m) => m.profile_id))
              const available = team.filter((p) => !memberIds.has(p.id))

              return (
                <DepartmentEditor
                  key={dept.id}
                  department={dept}
                  members={members.map((m) => ({
                    ...m,
                    name: team.find((p) => p.id === m.profile_id)?.full_name ?? 'Unknown',
                    email: team.find((p) => p.id === m.profile_id)?.email ?? '',
                  }))}
                  available={available.map((p) => ({
                    id: p.id,
                    label: p.full_name ?? p.email,
                  }))}
                />
              )
            })}
          </div>
        )}

        <form action={createTeam} className="mt-4 flex flex-col gap-3 border-t border-surface-border pt-4 sm:flex-row sm:items-end">
          <Field label="New department" htmlFor="new_department" className="sm:flex-1">
            <Input id="new_department" name="name" type="text" placeholder="Catering" required />
          </Field>
          <Button type="submit" className="w-full sm:w-auto">
            Add department
          </Button>
        </form>
      </section>
      )}

      {isCompany && (
      <section className={cardClasses()}>
        <h2 className="mb-1 text-sm font-medium">Your data</h2>
        <p className="mb-4 text-sm text-muted">
          Download everything this account holds — jobs, customers, quotes, invoices, expenses,
          timesheets and staff records — as a single JSON file. Uploaded photos and receipts are
          listed but not included; download those from the jobs themselves.
        </p>
        {/* Plain anchor: a route handler returning a file, not a page. */}
        <a href="/api/account/export" className={buttonClasses('secondary', 'md')} download>
          Download my data
        </a>
      </section>
      )}

      {isCompany && (
      <section className={cardClasses('border-rose-500/40')}>
        <h2 className="mb-1 text-sm font-medium text-rose-700 dark:text-rose-300">Close this account</h2>
        <p className="mb-2 text-sm text-muted">
          The account closes immediately for everyone in your business. Your data is then kept for{' '}
          {DELETION_GRACE_DAYS} days in case you change your mind, and permanently erased after
          that. Download your data first — once erased, nobody can recover it.
        </p>
        <p className="mb-4 text-sm text-muted">
          Type <span className="font-medium text-foreground">{company?.name}</span> to confirm.
        </p>
        <form action={requestAccountDeletion} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Company name" htmlFor="confirm_name" className="sm:flex-1">
            <Input id="confirm_name" name="confirm_name" type="text" required autoComplete="off" />
          </Field>
          <Button type="submit" variant="danger" className="w-full sm:w-auto">
            Close account
          </Button>
        </form>
      </section>
      )}
    </div>
  )
}

/**
 * One department: its name, who is in it, and which of them manage it.
 *
 * Manager is set here rather than on the person, because it is a per-department
 * fact — someone can run catering while being ordinary staff in operations, and
 * the company account can manage a department without that changing what it is.
 */
function DepartmentEditor({
  department,
  members,
  available,
}: {
  department: { id: string; name: string }
  members: { profile_id: string; role: 'manager' | 'staff'; name: string; email: string }[]
  available: { id: string; label: string }[]
}) {
  // Managers first, then alphabetical — the person who rosters is who you look
  // for when scanning a department.
  const ordered = [...members].sort((a, b) =>
    a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'manager' ? -1 : 1
  )

  return (
    <div className="rounded-lg border border-surface-border p-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form action={renameTeam.bind(null, department.id)} className="flex items-end gap-2">
          <Field label="Department" htmlFor={`team_name-${department.id}`}>
            <Input
              id={`team_name-${department.id}`}
              name="name"
              type="text"
              defaultValue={department.name}
              className="sm:w-56"
            />
          </Field>
          <Button type="submit" size="sm">
            Rename
          </Button>
        </form>

        <ConfirmSubmitButton
          action={deleteTeam.bind(null, department.id)}
          confirmMessage={`Delete the ${department.name} department? Its members stay in the company; only the department goes.`}
          className="pb-2 text-xs text-muted hover:text-accent"
        >
          Delete department
        </ConfirmSubmitButton>
      </div>

      {ordered.length === 0 ? (
        <p className="mt-3 text-xs text-muted">Nobody in this department yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {ordered.map((member) => (
            <li
              key={member.profile_id}
              className="flex flex-wrap items-center justify-between gap-2 border-t border-surface-border pt-2 text-sm"
            >
              <span>
                {member.name}
                {member.role === 'manager' && (
                  <span className="ml-2 rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-xs font-medium">
                    Manager
                  </span>
                )}
              </span>

              <span className="flex items-center gap-2">
                <form
                  action={updateTeamMemberRole.bind(null, department.id, member.profile_id)}
                  className="flex items-center gap-1.5"
                >
                  <Select
                    name="role"
                    defaultValue={member.role}
                    aria-label={`Role for ${member.name}`}
                    fullWidth={false}
                    size="sm"
                    className="w-28"
                  >
                    <option value="staff">Staff</option>
                    <option value="manager">Manager</option>
                  </Select>
                  <Button type="submit" size="sm">
                    Save
                  </Button>
                </form>

                <ConfirmSubmitButton
                  action={removeTeamMember.bind(null, department.id, member.profile_id)}
                  confirmMessage={`Remove ${member.name} from ${department.name}? They stay in the company and keep any other departments.`}
                  className="text-xs text-muted hover:text-accent"
                >
                  Remove
                </ConfirmSubmitButton>
              </span>
            </li>
          ))}
        </ul>
      )}

      {available.length > 0 && (
        <form
          action={addTeamMember.bind(null, department.id)}
          className="mt-3 flex flex-wrap items-end gap-2 border-t border-surface-border pt-3"
        >
          <Field label="Add someone" htmlFor={`add_member-${department.id}`}>
            <Select
              id={`add_member-${department.id}`}
              name="profile_id"
              fullWidth={false}
              size="sm"
              className="w-56"
            >
              {available.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="As" htmlFor={`add_role-${department.id}`}>
            <Select id={`add_role-${department.id}`} name="role" fullWidth={false} size="sm" className="w-28">
              <option value="staff">Staff</option>
              <option value="manager">Manager</option>
            </Select>
          </Field>
          <Button type="submit" size="sm">
            Add
          </Button>
        </form>
      )}
    </div>
  )
}

/**
 * Employment details and access control are deliberately separated.
 *
 * Pay rate used to sit at the end of the permissions row, styled like a
 * permission, which made it effectively invisible — a company owner looking for
 * "where do I set someone's pay?" did not find it. Job title has the same
 * problem waiting for it. They are employment facts; nothing below the divider
 * affects what anyone can see or do.
 */
function MemberEditor({
  member,
  action,
}: {
  // `id` is needed to scope the field ids — otherwise every member's inputs
  // share the same id and labels point at the wrong control.
  member: StaffPermissions & {
    id: string
    pay_rate: number | null
    pay_type: PayType | null
    job_title: string | null
  }
  action: (formData: FormData) => void
}) {
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-4">
        <Field label="Job title" htmlFor={`job_title-${member.id}`} className="min-w-[160px] flex-1">
          <Input
            id={`job_title-${member.id}`}
            name="job_title"
            type="text"
            placeholder="Electrician, Apprentice…"
            defaultValue={member.job_title ?? ''}
          />
        </Field>
        <PayFields idPrefix={member.id} payType={member.pay_type} payRate={member.pay_rate} />
      </div>

      <div className="border-t border-surface-border pt-3">
        <p className="mb-2 text-xs font-semibold text-muted">Access</p>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            name="can_view_all_jobs"
            defaultChecked={member.can_view_all_jobs}
            className={checkboxClasses()}
          />
          View all company jobs
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            name="can_edit_jobs"
            defaultChecked={member.can_edit_jobs}
            className={checkboxClasses()}
          />
          Edit jobs
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            name="can_log_expenses"
            defaultChecked={member.can_log_expenses}
            className={checkboxClasses()}
          />
          Log expenses/costs
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            name="can_view_reports"
            defaultChecked={member.can_view_reports}
            className={checkboxClasses()}
          />
          View reports
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            name="can_schedule"
            defaultChecked={member.can_schedule}
            className={checkboxClasses()}
          />
          Scheduling
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-4">
        <Field label="Quotes" htmlFor={`quotes-${member.id}`}>
          <Select id={`quotes-${member.id}`} name="quotes_access" defaultValue={member.quotes_access}>
            <option value="hidden">Hidden</option>
            <option value="view">View</option>
            <option value="full">Full access</option>
          </Select>
        </Field>
        <Field label="Invoicing" htmlFor={`invoices-${member.id}`}>
          <Select id={`invoices-${member.id}`} name="invoices_access" defaultValue={member.invoices_access}>
            <option value="hidden">Hidden</option>
            <option value="view">View</option>
            <option value="full">Full access</option>
          </Select>
        </Field>
      </div>
      </div>

      <Button type="submit" size="sm" className="self-start">
        Save changes
      </Button>
    </form>
  )
}
