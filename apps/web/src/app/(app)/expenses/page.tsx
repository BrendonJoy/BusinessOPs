import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/money'
import { getCompanyCurrency } from '@/lib/company'
import type { Expense } from '@trade-assist/db'
import ConfirmSubmitButton from '@/components/ConfirmSubmitButton'
import { assignExpenseToJob, deleteExpense, uploadExpense } from './actions'

type JobOption = { id: string; job_number: string | null }

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error: actionError } = await searchParams
  const supabase = await createClient()
  const { currency, tax_label, default_tax_rate } = await getCompanyCurrency(supabase)

  const { data: expensesData } = await supabase
    .from('expenses')
    .select('*')
    .order('created_at', { ascending: false })

  const expenses = (expensesData ?? []) as Expense[]

  const { data: jobsData } = await supabase
    .from('jobs')
    .select('id, job_number')
    .order('created_at', { ascending: false })

  const jobs = (jobsData ?? []) as JobOption[]
  const jobsById = new Map(jobs.map((j) => [j.id, j]))

  const withSignedUrls = await Promise.all(
    expenses.map(async (expense) => {
      const { data } = await supabase.storage
        .from('expense-receipts')
        .createSignedUrl(expense.file_path, 3600)
      return { ...expense, signedUrl: data?.signedUrl ?? null }
    })
  )

  const unassigned = withSignedUrls.filter((e) => !e.cost_entry_id)
  const assigned = withSignedUrls.filter((e) => e.cost_entry_id)

  return (
    <div className="flex flex-col gap-8">
      {actionError && (
        <p className="rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{actionError}</p>
      )}

      <div>
        <h1 className="text-xl font-semibold">Expenses</h1>
        <p className="text-sm text-muted">
          Upload a receipt or invoice, then assign it to a job to add it as a cost.
        </p>
      </div>

      <section className="rounded-lg border border-surface-border p-4">
        <h2 className="mb-4 text-sm font-medium">Upload receipt</h2>
        <div className="flex flex-wrap items-center gap-3">
          <form action={uploadExpense} className="flex flex-wrap items-center gap-3">
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
          <form action={uploadExpense} className="flex flex-wrap items-center gap-3">
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
        <h2 className="mb-4 text-sm font-medium">Unassigned ({unassigned.length})</h2>

        {unassigned.length === 0 ? (
          <p className="text-sm text-muted">No unassigned expenses.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {unassigned.map((expense) => {
              const boundAssign = assignExpenseToJob.bind(null, expense.id)
              const boundDelete = deleteExpense.bind(null, expense.id, expense.file_path, undefined)
              return (
                <div key={expense.id} className="rounded-md border border-surface-border p-3">
                  <div className="mb-3 flex items-center justify-between">
                    {expense.signedUrl ? (
                      <a href={expense.signedUrl} target="_blank" rel="noreferrer" className="text-sm text-accent">
                        View receipt
                      </a>
                    ) : (
                      <span className="text-sm text-muted">Receipt unavailable</span>
                    )}
                    <ConfirmSubmitButton
                      action={boundDelete}
                      confirmMessage="Permanently delete this receipt? This cannot be undone."
                      className="text-xs text-muted hover:text-accent"
                    >
                      Remove
                    </ConfirmSubmitButton>
                  </div>

                  <form action={boundAssign} className="flex flex-wrap items-end gap-3">
                    <div className="flex flex-col gap-1">
                      <label htmlFor={`description-${expense.id}`} className="text-xs font-medium">
                        Description
                      </label>
                      <input
                        id={`description-${expense.id}`}
                        name="description"
                        type="text"
                        defaultValue={expense.description}
                        required
                        className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor={`amount-${expense.id}`} className="text-xs font-medium">
                        Amount paid
                      </label>
                      <input
                        id={`amount-${expense.id}`}
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
                        {tax_label} applies ({default_tax_rate}%)
                      </label>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor={`type-${expense.id}`} className="text-xs font-medium">
                        Type
                      </label>
                      <select
                        id={`type-${expense.id}`}
                        name="type"
                        defaultValue="material"
                        className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
                      >
                        <option value="material">Material</option>
                        <option value="labour">Labour</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor={`job-${expense.id}`} className="text-xs font-medium">
                        Job
                      </label>
                      <select
                        id={`job-${expense.id}`}
                        name="job_id"
                        required
                        className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
                      >
                        <option value="">Select a job…</option>
                        {jobs.map((job) => (
                          <option key={job.id} value={job.id}>
                            {job.job_number ?? job.id}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="submit"
                      className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
                    >
                      Assign to job
                    </button>
                  </form>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-surface-border p-4">
        <h2 className="mb-4 text-sm font-medium">Assigned ({assigned.length})</h2>

        {assigned.length === 0 ? (
          <p className="text-sm text-muted">No assigned expenses yet.</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="py-1 font-medium">Job</th>
                <th className="py-1 font-medium">Description</th>
                <th className="py-1 font-medium">Amount</th>
                <th className="py-1 font-medium">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {assigned.map((expense) => (
                <tr key={expense.id} className="border-t border-surface-border">
                  <td className="py-1">
                    {expense.job_id ? (
                      <a href={`/jobs/${expense.job_id}`} className="text-accent hover:opacity-80">
                        {jobsById.get(expense.job_id)?.job_number ?? expense.job_id}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-1">{expense.description}</td>
                  <td className="py-1">{formatMoney(Number(expense.amount), currency)}</td>
                  <td className="py-1">
                    {expense.signedUrl ? (
                      <a href={expense.signedUrl} target="_blank" rel="noreferrer" className="text-accent">
                        View
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>
    </div>
  )
}
