import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBaseUrl } from '@/lib/url'
import { formatMoney } from '@/lib/money'
import { formatAuditTimestamp } from '@/lib/audit'
import { getCurrentProfile, isCompanyAdmin } from '@/lib/roles'
import { JOB_STATUSES, JOB_STATUS_LABELS } from '@trade-assist/db'
import type { Customer, CostEntry, Expense, Job, JobFile } from '@trade-assist/db'
import { addCostEntry, deleteCostEntry, deleteJob, deleteJobFile, updateJob, uploadJobFile } from './actions'
import { assignExpenseToJob, deleteExpense, uploadExpenseForJob } from '@/app/(app)/expenses/actions'
import QuotePanel, { type QuoteDetail } from './QuotePanel'
import InvoicePanel, { type InvoiceDetail } from './InvoicePanel'
import DeleteJobButton from './DeleteJobButton'
import JobAddressField from '@/components/JobAddressField'
import ConfirmSubmitButton from '@/components/ConfirmSubmitButton'

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
  company: { currency: string; tax_label: string; gst_registered: boolean }
  job_audit_log: AuditEntry[]
  assigned_profile: { full_name: string | null; email: string } | null
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
      '*, customer:customers(*), cost_entries(*), job_files(*), company:companies(currency, tax_label, gst_registered), job_audit_log(id, action, created_at, profile:profiles(full_name)), assigned_profile:profiles!jobs_assigned_user_id_fkey(full_name, email)'
    )
    .eq('id', id)
    .maybeSingle()

  const job = data as unknown as JobDetail | null

  if (!job) notFound()

  const currentProfile = await getCurrentProfile(supabase)
  const canManageAssignment = isCompanyAdmin(currentProfile?.role)

  let teamOptions: { id: string; full_name: string | null; email: string }[] = []
  if (canManageAssignment) {
    const { data: team } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('company_id', job.company_id)
      .order('full_name')
    teamOptions = team ?? []
  }

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

  return (
    <div className="flex flex-col gap-8">
      {actionError && (
        <p className="rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{actionError}</p>
      )}

      <div>
        <p className="text-sm text-muted">Job</p>
        <h1 className="text-2xl font-semibold">{job.job_number ?? '—'}</h1>
        <p className="text-sm text-muted">{job.customer?.name ?? 'No customer'}</p>
        <div className="mt-3 flex gap-6 text-sm">
          <span>
            Invoiced: <span className="font-medium">{formatMoney(invoicedTotal, currency)}</span>
          </span>
          <span>
            Costs:{' '}
            <span className="font-medium">{formatMoney(materialsTotal + labourTotal, currency)}</span>
          </span>
          <span>
            Profit: <span className="font-medium">{formatMoney(profit, currency)}</span>
          </span>
        </div>
      </div>

      <section className="rounded-lg border border-surface-border p-4">
        <h2 className="mb-4 text-sm font-medium">Details</h2>
        <form action={boundUpdateJob} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="status" className="text-sm font-medium">
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={job.status}
              className="max-w-xs rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            >
              {JOB_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {JOB_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>

          <JobAddressField
            defaultValue={job.address_line ?? ''}
            defaultLat={job.geo_lat}
            defaultLng={job.geo_lng}
            customerAddress={job.customer?.address ?? null}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="start_date" className="text-sm font-medium">
                Start date
              </label>
              <div className="flex gap-2">
                <input
                  id="start_date"
                  name="start_date"
                  type="date"
                  defaultValue={job.start_date ?? ''}
                  className="flex-1 rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
                />
                <input
                  id="start_time"
                  name="start_time"
                  type="time"
                  defaultValue={job.start_time ?? ''}
                  className="w-36 rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="finish_date" className="text-sm font-medium">
                Finish date
              </label>
              <div className="flex gap-2">
                <input
                  id="finish_date"
                  name="finish_date"
                  type="date"
                  defaultValue={job.finish_date ?? ''}
                  className="flex-1 rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
                />
                <input
                  id="finish_time"
                  name="finish_time"
                  type="time"
                  defaultValue={job.finish_time ?? ''}
                  className="w-36 rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Assigned to</label>
            {canManageAssignment ? (
              <select
                name="assigned_user_id"
                defaultValue={job.assigned_user_id ?? ''}
                className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
              >
                <option value="">Unassigned</option>
                {teamOptions.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.full_name ?? member.email}
                  </option>
                ))}
              </select>
            ) : (
              <p className="rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-muted">
                {job.assigned_profile?.full_name ?? job.assigned_profile?.email ?? 'Unassigned'}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="notes" className="text-sm font-medium">
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={job.notes ?? ''}
              className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>

          <button
            type="submit"
            className="self-start rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
          >
            Save
          </button>
        </form>

        <div className="mt-4 border-t border-surface-border pt-4">
          <DeleteJobButton jobNumber={job.job_number ?? 'this job'} deleteJob={deleteJob.bind(null, job.id)} />
        </div>
      </section>

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
      />

      <section className="rounded-lg border border-surface-border p-4">
        <h2 className="mb-4 text-sm font-medium">Costs</h2>

        <div className="mb-4 flex gap-6 text-sm">
          <span>
            Materials: <span className="font-medium">{formatMoney(materialsTotal, currency)}</span>
          </span>
          <span>
            Labour: <span className="font-medium">{formatMoney(labourTotal, currency)}</span>
          </span>
          <span>
            Total:{' '}
            <span className="font-medium">{formatMoney(materialsTotal + labourTotal, currency)}</span>
          </span>
        </div>

        {job.cost_entries.length > 0 && (
          <div className="mb-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="py-1 font-medium">Type</th>
                <th className="py-1 font-medium">Description</th>
                <th className="py-1 font-medium">Qty</th>
                <th className="py-1 font-medium">Unit cost</th>
                <th className="py-1 font-medium">Total</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {job.cost_entries.map((entry) => {
                const boundDelete = deleteCostEntry.bind(null, job.id, entry.id)
                const receiptUrl = receiptByCostEntryId.get(entry.id)
                return (
                  <tr key={entry.id} className="border-t border-surface-border">
                    <td className="py-1 capitalize">{entry.type}</td>
                    <td className="py-1">
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
                    </td>
                    <td className="py-1">{entry.quantity}</td>
                    <td className="py-1">{formatMoney(Number(entry.unit_cost), currency)}</td>
                    <td className="py-1">{formatMoney(Number(entry.total_cost), currency)}</td>
                    <td className="py-1 text-right">
                      {entry.invoiced_at ? (
                        <span className="inline-flex items-center rounded-full bg-surface px-2 py-0.5 text-xs text-muted">
                          Invoiced
                        </span>
                      ) : (
                        <form action={boundDelete}>
                          <button type="submit" className="text-xs text-muted hover:text-accent">
                            Remove
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        )}

        <form action={boundAddCostEntry} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="type" className="text-xs font-medium">
              Type
            </label>
            <select
              id="type"
              name="type"
              className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            >
              <option value="material">Material</option>
              <option value="labour">Labour</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="description" className="text-xs font-medium">
              Description
            </label>
            <input
              id="description"
              name="description"
              type="text"
              required
              className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="quantity" className="text-xs font-medium">
              Qty / hours
            </label>
            <input
              id="quantity"
              name="quantity"
              type="number"
              step="0.01"
              defaultValue="1"
              className="w-24 rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="unit_cost" className="text-xs font-medium">
              Unit cost / rate
            </label>
            <input
              id="unit_cost"
              name="unit_cost"
              type="number"
              step="0.01"
              defaultValue="0"
              className="w-28 rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="rounded-md border border-surface-border px-4 py-2 text-sm font-medium hover:border-accent"
          >
            Add
          </button>
        </form>

        <div className="mt-6 border-t border-surface-border pt-4">
          <h3 className="mb-3 text-xs font-semibold text-muted">Add cost from receipt</h3>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <form action={boundUploadExpense} className="flex flex-wrap items-center gap-3">
              <input
                type="file"
                name="file"
                accept="image/*,application/pdf"
                required
                className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-surface file:px-3 file:py-2 file:text-sm"
              />
              <button
                type="submit"
                className="rounded-md border border-surface-border px-4 py-2 text-sm font-medium hover:border-accent"
              >
                Upload
              </button>
            </form>
            <form action={boundUploadExpense} className="flex flex-wrap items-center gap-3">
              <input
                type="file"
                name="file"
                accept="image/*"
                capture="environment"
                required
                className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-surface file:px-3 file:py-2 file:text-sm"
              />
              <button
                type="submit"
                className="rounded-md border border-surface-border px-4 py-2 text-sm font-medium hover:border-accent"
              >
                Take photo
              </button>
            </form>
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

                    <form action={boundAssignExpense} className="flex flex-wrap items-end gap-3">
                      <input type="hidden" name="job_id" value={job.id} />
                      <div className="flex flex-col gap-1">
                        <label htmlFor={`expense-description-${expense.id}`} className="text-xs font-medium">
                          Description
                        </label>
                        <input
                          id={`expense-description-${expense.id}`}
                          name="description"
                          type="text"
                          defaultValue={expense.description}
                          required
                          className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label htmlFor={`expense-amount-${expense.id}`} className="text-xs font-medium">
                          Amount paid
                        </label>
                        <input
                          id={`expense-amount-${expense.id}`}
                          name="amount"
                          type="number"
                          step="0.01"
                          defaultValue={expense.amount}
                          className="w-28 rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="flex items-center gap-2 whitespace-nowrap text-xs font-medium">
                          <input type="checkbox" name="gst_applies" />
                          {taxLabel} applies
                        </label>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label htmlFor={`expense-type-${expense.id}`} className="text-xs font-medium">
                          Type
                        </label>
                        <select
                          id={`expense-type-${expense.id}`}
                          name="type"
                          defaultValue="material"
                          className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
                        >
                          <option value="material">Material</option>
                          <option value="labour">Labour</option>
                        </select>
                      </div>
                      <button
                        type="submit"
                        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
                      >
                        Add as cost
                      </button>
                    </form>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-surface-border p-4">
        <h2 className="mb-4 text-sm font-medium">Photos &amp; files</h2>

        {filesWithUrls.length > 0 && (
          <ul className="mb-4 flex flex-col gap-2 text-sm">
            {filesWithUrls.map((f) => {
              const boundDeleteFile = deleteJobFile.bind(null, job.id, f.id, f.file_url)
              return (
                <li key={f.id} className="flex items-center justify-between gap-4">
                  {f.signedUrl ? (
                    <a href={f.signedUrl} target="_blank" rel="noreferrer" className="text-accent">
                      {f.file_url.split('/').pop()}
                    </a>
                  ) : (
                    <span>{f.file_url.split('/').pop()}</span>
                  )}
                  <ConfirmSubmitButton
                    action={boundDeleteFile}
                    confirmMessage="Permanently delete this file? This cannot be undone."
                    className="text-xs text-muted hover:text-accent"
                  >
                    Remove
                  </ConfirmSubmitButton>
                </li>
              )
            })}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <form action={boundUploadJobFile} className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              name="file"
              required
              className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-surface file:px-3 file:py-2 file:text-sm"
            />
            <button
              type="submit"
              className="rounded-md border border-surface-border px-4 py-2 text-sm font-medium hover:border-accent"
            >
              Upload
            </button>
          </form>
          <form action={boundUploadJobFile} className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              name="file"
              accept="image/*"
              capture="environment"
              required
              className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-surface file:px-3 file:py-2 file:text-sm"
            />
            <button
              type="submit"
              className="rounded-md border border-surface-border px-4 py-2 text-sm font-medium hover:border-accent"
            >
              Take photo
            </button>
          </form>
        </div>
      </section>

      <section className="rounded-lg border border-surface-border p-4">
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
      </section>
    </div>
  )
}
