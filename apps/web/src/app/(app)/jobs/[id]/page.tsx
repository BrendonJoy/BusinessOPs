import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBaseUrl } from '@/lib/url'
import { formatMoney } from '@/lib/money'
import { formatAuditTimestamp } from '@/lib/audit'
import { getCurrentProfile, isCompanyAccount } from '@/lib/roles'
import { JOB_STATUSES, JOB_STATUS_LABELS } from '@trade-assist/db'
import type { Customer, CostEntry, Expense, Job, JobFile } from '@trade-assist/db'
import {
  addCostEntry,
  deleteCostEntry,
  deleteJob,
  deleteJobFile,
  updateJob,
  updateJobAssignment,
  uploadJobFile,
} from './actions'
import { assignExpenseToJob, deleteExpense, uploadExpenseForJob } from '@/app/(app)/expenses/actions'
import QuotePanel, { type QuoteDetail } from './QuotePanel'
import InvoicePanel, { type InvoiceDetail } from './InvoicePanel'
import CostEntryForm from './CostEntryForm'
import DeleteJobButton from './DeleteJobButton'
import JobAddressField from '@/components/JobAddressField'
import ConfirmSubmitButton from '@/components/ConfirmSubmitButton'
import FileUploadButtons from '@/components/FileUploadButtons'
import { formatDate } from '@/lib/dates'
import {
  Badge,
  Button,
  Card,
  DataTable,
  Field,
  Input,
  Notice,
  Select,
  Stat,
  Textarea,
  checkboxClasses,
  type Column,
} from '@/components/ui'

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'avif']

function isImageFile(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return IMAGE_EXTENSIONS.includes(ext)
}

type AuditEntry = {
  id: string
  action: string
  created_at: string
  profile: { full_name: string | null } | null
}

type JobDetail = Job & {
  customer: Customer | null
  cost_entries: CostEntry[]
  job_files: JobFile[]
  company: {
    currency: string
    tax_label: string
    gst_registered: boolean
    modules_quotes_enabled: boolean
    modules_invoicing_enabled: boolean
    modules_expenses_enabled: boolean
  }
  job_audit_log: AuditEntry[]
  job_assignments: { profile_id: string; profile: { full_name: string | null; email: string } | null }[]
}

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; openQuote?: string; openInvoice?: string }>
}) {
  const { id } = await params
  const { error: actionError, openQuote, openInvoice } = await searchParams
  const supabase = await createClient()

  const { data } = await supabase
    .from('jobs')
    .select(
      '*, customer:customers(*), cost_entries(*), job_files(*), company:companies(currency, tax_label, gst_registered, modules_quotes_enabled, modules_invoicing_enabled, modules_expenses_enabled), job_audit_log(id, action, created_at, profile:profiles(full_name)), job_assignments(profile_id, profile:profiles(full_name, email))'
    )
    .eq('id', id)
    .maybeSingle()

  const job = data as unknown as JobDetail | null

  if (!job) notFound()

  const currentProfile = await getCurrentProfile(supabase)
  const isCompany = isCompanyAccount(currentProfile?.role)
  const canManageAssignment = isCompany || Boolean(currentProfile?.can_schedule)
  const canEditJob = isCompany || Boolean(currentProfile?.can_edit_jobs)
  const canLogExpenses =
    job.company.modules_expenses_enabled && (isCompany || Boolean(currentProfile?.can_log_expenses))
  const quotesAccessLevel = job.company.modules_quotes_enabled
    ? isCompany
      ? 'full'
      : (currentProfile?.quotes_access ?? 'hidden')
    : 'hidden'
  const invoicesAccessLevel = job.company.modules_invoicing_enabled
    ? isCompany
      ? 'full'
      : (currentProfile?.invoices_access ?? 'hidden')
    : 'hidden'

  let payRate: number | null = null
  if (!isCompany && currentProfile) {
    const { data: rateRow } = await supabase
      .from('staff_pay_rates')
      .select('pay_rate')
      .eq('profile_id', currentProfile.id)
      .maybeSingle()
    payRate = rateRow ? Number(rateRow.pay_rate) : null
  }

  let teamOptions: { id: string; full_name: string | null; email: string }[] = []
  if (canManageAssignment) {
    const { data: team } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('company_id', job.company_id)
      .order('full_name')
    teamOptions = team ?? []
  }

  const assignedIds = new Set(job.job_assignments.map((a) => a.profile_id))
  const currency = job.company.currency
  const taxLabel = job.company.tax_label
  const gstRegistered = job.company.gst_registered
  const auditLog = [...job.job_audit_log].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  const materials = job.cost_entries.filter((c) => c.type === 'material')
  const labour = job.cost_entries.filter((c) => c.type === 'labour')
  const materialsTotal = materials.reduce((sum, c) => sum + Number(c.total_cost), 0)
  const labourTotal = labour.reduce((sum, c) => sum + Number(c.total_cost), 0)

  const filesWithUrls = await Promise.all(
    job.job_files.map(async (f) => {
      const { data } = await supabase.storage.from('job-files').createSignedUrl(f.file_url, 3600)
      return { ...f, signedUrl: data?.signedUrl ?? null }
    })
  )

  const { data: jobExpenses } = await supabase
    .from('expenses')
    .select('cost_entry_id, file_path')
    .eq('job_id', job.id)
    .not('cost_entry_id', 'is', null)

  const receiptByCostEntryId = new Map(
    await Promise.all(
      (jobExpenses ?? []).map(async (e) => {
        const { data } = await supabase.storage.from('expense-receipts').createSignedUrl(e.file_path, 3600)
        return [e.cost_entry_id as string, data?.signedUrl ?? null] as const
      })
    )
  )

  const { data: unassignedExpensesData } = await supabase
    .from('expenses')
    .select('*')
    .eq('job_id', job.id)
    .is('cost_entry_id', null)
    .order('created_at', { ascending: false })

  const unassignedExpenses = await Promise.all(
    ((unassignedExpensesData ?? []) as Expense[]).map(async (e) => {
      const { data } = await supabase.storage.from('expense-receipts').createSignedUrl(e.file_path, 3600)
      return { ...e, signedUrl: data?.signedUrl ?? null }
    })
  )

  const { data: quotesData } = await supabase
    .from('quotes')
    .select('*, quote_line_items(*)')
    .eq('job_id', job.id)
    .order('created_at', { ascending: false })

  const allQuotes = (quotesData ?? []) as unknown as QuoteDetail[]
  const quote = allQuotes.find((q) => !q.superseded_at) ?? null
  const previousQuotes = allQuotes.filter((q) => q.superseded_at)
  const baseUrl = await getBaseUrl()

  const { data: invoicesData } = await supabase
    .from('invoices')
    .select('*, invoice_line_items(*)')
    .eq('job_id', job.id)
    .order('created_at', { ascending: false })

  const allInvoices = (invoicesData ?? []) as unknown as InvoiceDetail[]
  const invoices = allInvoices.filter((inv) => !inv.superseded_at)
  const previousInvoices = allInvoices.filter((inv) => inv.superseded_at)
  const uninvoicedCostEntries = job.cost_entries.filter((c) => !c.invoiced_at)
  const invoicedTotal = invoices.reduce((sum, inv) => sum + Number(inv.total) + Number(inv.tax_amount), 0)
  const profit = invoicedTotal - (materialsTotal + labourTotal)

  const boundUpdateJob = updateJob.bind(null, job.id)
  const boundAddCostEntry = addCostEntry.bind(null, job.id)
  const boundUploadJobFile = uploadJobFile.bind(null, job.id)
  const boundUploadExpense = uploadExpenseForJob.bind(null, job.id)

  const costColumns: Column<CostEntry>[] = [
    {
      key: 'description',
      header: 'Description',
      mobile: 'title',
      cell: (entry) => {
        const receiptUrl = receiptByCostEntryId.get(entry.id)
        return (
          <>
            {entry.description}
            {receiptUrl !== undefined && (
              <>
                {' '}
                {receiptUrl ? (
                  <a
                    href={receiptUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-accent hover:opacity-80"
                  >
                    (receipt)
                  </a>
                ) : (
                  <span className="text-xs text-muted">(receipt)</span>
                )}
              </>
            )}
          </>
        )
      },
    },
    {
      key: 'total',
      header: 'Total',
      mobile: 'meta',
      cell: (entry) => formatMoney(Number(entry.total_cost), currency),
    },
    {
      key: 'type',
      header: 'Type',
      className: 'capitalize',
      cell: (entry) => <span className="capitalize">{entry.type}</span>,
    },
    { key: 'quantity', header: 'Qty', mobileLabel: 'Qty', cell: (entry) => entry.quantity },
    {
      key: 'unit_cost',
      header: 'Unit cost',
      cell: (entry) => formatMoney(Number(entry.unit_cost), currency),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      mobileLabel: '',
      cell: (entry) =>
        entry.invoiced_at ? (
          <Badge tone="muted">Invoiced</Badge>
        ) : (
          canEditJob && (
            <form action={deleteCostEntry.bind(null, job.id, entry.id)}>
              <button type="submit" className="text-xs text-muted hover:text-accent">
                Remove
              </button>
            </form>
          )
        ),
    },
  ]

  return (
    <div className="flex flex-col gap-8">
      {actionError && <Notice tone="error">{actionError}</Notice>}

      <div>
        <p className="text-sm text-muted">Job</p>
        <h1 className="text-2xl font-semibold tracking-tight">{job.job_number ?? '—'}</h1>
        <p className="text-sm text-muted">{job.customer?.name ?? 'No customer'}</p>
        {/* Tiles rather than an inline run of text — three money figures on one
            line wrapped mid-label at phone width. */}
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Stat label="Invoiced" value={formatMoney(invoicedTotal, currency)} />
          <Stat label="Costs" value={formatMoney(materialsTotal + labourTotal, currency)} />
          <Stat label="Profit" value={formatMoney(profit, currency)} />
        </div>
      </div>

      <Card>
        <h2 className="mb-4 text-sm font-medium">Photos &amp; files</h2>

        {filesWithUrls.length > 0 && (
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {filesWithUrls.map((f) => {
              const boundDeleteFile = deleteJobFile.bind(null, job.id, f.id, f.file_url)
              const fileName = f.file_url.split('/').pop() ?? 'file'
              return (
                <div key={f.id} className="flex flex-col gap-1">
                  <a
                    href={f.signedUrl ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="block overflow-hidden rounded-md border border-surface-border hover:border-accent"
                  >
                    {f.signedUrl && isImageFile(f.file_url) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.signedUrl} alt={fileName} className="h-28 w-full object-cover" />
                    ) : (
                      <div className="flex h-28 w-full flex-col items-center justify-center gap-1 bg-surface px-2">
                        <span className="text-2xl">📄</span>
                        <span className="w-full truncate text-center text-xs text-muted">{fileName}</span>
                      </div>
                    )}
                  </a>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-muted">{fileName}</span>
                    {canEditJob && (
                      <ConfirmSubmitButton
                        action={boundDeleteFile}
                        confirmMessage="Permanently delete this file? This cannot be undone."
                        className="shrink-0 text-xs text-muted hover:text-accent"
                      >
                        Remove
                      </ConfirmSubmitButton>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {filesWithUrls.length === 0 && <p className="mb-4 text-sm text-muted">No photos or files yet.</p>}

        {canEditJob && <FileUploadButtons action={boundUploadJobFile} camera />}
      </Card>

      <Card>
        <h2 className="mb-4 text-sm font-medium">Details</h2>

        {canEditJob ? (
          <form action={boundUpdateJob} className="flex flex-col gap-4">
            <Field label="Status" htmlFor="status" className="max-w-xs">
              <Select id="status" name="status" defaultValue={job.status} fullWidth>
                {JOB_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {JOB_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </Field>

            <JobAddressField
              defaultValue={job.address_line ?? ''}
              defaultLat={job.geo_lat}
              defaultLng={job.geo_lng}
              customerAddress={job.customer?.address ?? null}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Start date" htmlFor="start_date">
                <div className="flex gap-2">
                  <Input
                    id="start_date"
                    name="start_date"
                    type="date"
                    defaultValue={job.start_date ?? ''}
                    className="min-w-0 flex-1"
                  />
                  <Input
                    id="start_time"
                    name="start_time"
                    type="time"
                    defaultValue={job.start_time ?? ''}
                    aria-label="Start time"
                    fullWidth={false}
                    className="w-32 shrink-0"
                  />
                </div>
              </Field>
              <Field label="Finish date" htmlFor="finish_date">
                <div className="flex gap-2">
                  <Input
                    id="finish_date"
                    name="finish_date"
                    type="date"
                    defaultValue={job.finish_date ?? ''}
                    className="min-w-0 flex-1"
                  />
                  <Input
                    id="finish_time"
                    name="finish_time"
                    type="time"
                    defaultValue={job.finish_time ?? ''}
                    aria-label="Finish time"
                    fullWidth={false}
                    className="w-32 shrink-0"
                  />
                </div>
              </Field>
            </div>

            <Field label="Notes" htmlFor="notes">
              <Textarea id="notes" name="notes" rows={3} defaultValue={job.notes ?? ''} />
            </Field>

            <Button type="submit" variant="primary" className="self-start">
              Save
            </Button>
          </form>
        ) : (
          <div className="flex flex-col gap-4 text-sm">
            <div>
              <p className="text-xs font-medium text-muted">Status</p>
              <p>{JOB_STATUS_LABELS[job.status]}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted">Job address</p>
              <p>{job.address_line || '—'}</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-muted">Start date</p>
                <p>
                  {formatDate(job.start_date)} {job.start_time ?? ''}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted">Finish date</p>
                <p>
                  {formatDate(job.finish_date)} {job.finish_time ?? ''}
                </p>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-muted">Notes</p>
              <p className="whitespace-pre-wrap">{job.notes || '—'}</p>
            </div>
          </div>
        )}

        <div className="mt-4 border-t border-surface-border pt-4">
          <label className="mb-1 block text-sm font-medium">Assigned to</label>
          {canManageAssignment ? (
            <form action={updateJobAssignment.bind(null, job.id)} className="flex flex-col gap-2">
              <div className="flex flex-col gap-2 rounded-md border border-surface-border px-3 py-2">
                {teamOptions.length === 0 ? (
                  <p className="text-sm text-muted">No team members yet.</p>
                ) : (
                  teamOptions.map((member) => (
                    <label key={member.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="assigned_user_ids"
                        value={member.id}
                        defaultChecked={assignedIds.has(member.id)}
                      />
                      {member.full_name ?? member.email}
                    </label>
                  ))
                )}
              </div>
              <button
                type="submit"
                className="self-start rounded-md border border-surface-border px-3 py-2 text-xs font-medium hover:border-accent"
              >
                Save
              </button>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              {job.job_assignments.length === 0 ? (
                <p className="rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-muted">
                  Unassigned
                </p>
              ) : (
                job.job_assignments.map((a) => (
                  <span
                    key={a.profile_id}
                    className="rounded-md border border-surface-border bg-surface px-3 py-2 text-sm"
                  >
                    {a.profile?.full_name ?? a.profile?.email ?? 'Team member'}
                  </span>
                ))
              )}
            </div>
          )}
        </div>

        {isCompany && (
          <div className="mt-4 border-t border-surface-border pt-4">
            <DeleteJobButton jobNumber={job.job_number ?? 'this job'} deleteJob={deleteJob.bind(null, job.id)} />
          </div>
        )}
      </Card>

      <QuotePanel
        key={quote?.id ?? 'none'}
        jobId={job.id}
        quote={quote}
        previousQuotes={previousQuotes}
        baseUrl={baseUrl}
        initialOpenId={openQuote}
        currency={currency}
        taxLabel={taxLabel}
        gstRegistered={gstRegistered}
        accessLevel={quotesAccessLevel}
      />

      <InvoicePanel
        key={invoices.map((inv) => inv.id).join(',')}
        jobId={job.id}
        invoices={invoices}
        previousInvoices={previousInvoices}
        uninvoicedCostEntries={uninvoicedCostEntries}
        initialOpenId={openInvoice}
        currency={currency}
        taxLabel={taxLabel}
        gstRegistered={gstRegistered}
        accessLevel={invoicesAccessLevel}
      />

      <Card>
        <h2 className="mb-4 text-sm font-medium">Costs</h2>

        <div className="mb-4 grid grid-cols-3 gap-3">
          <Stat label="Materials" value={formatMoney(materialsTotal, currency)} />
          <Stat label="Labour" value={formatMoney(labourTotal, currency)} />
          <Stat label="Total" value={formatMoney(materialsTotal + labourTotal, currency)} />
        </div>

        {job.cost_entries.length > 0 && (
          <div className="mb-4">
            <DataTable
              columns={costColumns}
              rows={job.cost_entries}
              getRowKey={(entry) => entry.id}
            />
          </div>
        )}

        {canEditJob && <CostEntryForm action={boundAddCostEntry} payRate={payRate} />}

        {canLogExpenses && (
        <div className="mt-6 border-t border-surface-border pt-4">
          <h3 className="mb-3 text-xs font-semibold text-muted">Add cost from receipt</h3>

          <div className="mb-4">
            <FileUploadButtons
              action={boundUploadExpense}
              accept="image/*,application/pdf"
              camera
              label="Upload receipt"
            />
          </div>

          {unassignedExpenses.length > 0 && (
            <div className="flex flex-col gap-4">
              {unassignedExpenses.map((expense) => {
                const boundAssignExpense = assignExpenseToJob.bind(null, expense.id)
                const boundDeleteExpense = deleteExpense.bind(null, expense.id, expense.file_path, job.id)
                return (
                  <div key={expense.id} className="rounded-md border border-surface-border p-3">
                    <div className="mb-3 flex items-center justify-between">
                      {expense.signedUrl ? (
                        <a
                          href={expense.signedUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-accent"
                        >
                          View receipt
                        </a>
                      ) : (
                        <span className="text-sm text-muted">Receipt unavailable</span>
                      )}
                      <ConfirmSubmitButton
                        action={boundDeleteExpense}
                        confirmMessage="Permanently delete this receipt? This cannot be undone."
                        className="text-xs text-muted hover:text-accent"
                      >
                        Remove
                      </ConfirmSubmitButton>
                    </div>

                    <form
                      action={boundAssignExpense}
                      className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
                    >
                      <input type="hidden" name="job_id" value={job.id} />
                      <Field
                        label="Description"
                        htmlFor={`expense-description-${expense.id}`}
                        required
                        className="min-w-[200px] flex-1"
                      >
                        <Input
                          id={`expense-description-${expense.id}`}
                          name="description"
                          type="text"
                          defaultValue={expense.description}
                          required
                        />
                      </Field>
                      <Field label="Amount paid" htmlFor={`expense-amount-${expense.id}`}>
                        <Input
                          id={`expense-amount-${expense.id}`}
                          name="amount"
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          defaultValue={expense.amount}
                          className="sm:w-28"
                        />
                      </Field>
                      <label className="flex min-h-11 items-center gap-2 text-sm font-medium sm:min-h-9 sm:whitespace-nowrap">
                        <input type="checkbox" name="gst_applies" className={checkboxClasses()} />
                        {taxLabel} applies
                      </label>
                      <Field label="Type" htmlFor={`expense-type-${expense.id}`}>
                        <Select
                          id={`expense-type-${expense.id}`}
                          name="type"
                          defaultValue="material"
                        >
                          <option value="material">Material</option>
                          <option value="labour">Labour</option>
                        </Select>
                      </Field>
                      <Button type="submit" variant="primary">
                        Add as cost
                      </Button>
                    </form>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-4 text-sm font-medium">Activity</h2>

        {auditLog.length === 0 ? (
          <p className="text-sm text-muted">No activity recorded yet.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {auditLog.map((entry) => (
              <li key={entry.id} className="text-muted">
                <span className="text-foreground">{formatAuditTimestamp(entry.created_at)}</span>{' '}
                {entry.profile?.full_name ?? 'System'} — {entry.action}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
