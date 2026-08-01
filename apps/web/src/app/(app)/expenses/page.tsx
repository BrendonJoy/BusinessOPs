import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/money'
import { getCompanyCurrency, getCompanyModules } from '@/lib/company'
import { getCurrentProfile, isCompanyAccount } from '@/lib/roles'
import type { Expense } from '@trade-assist/db'
import ConfirmSubmitButton from '@/components/ConfirmSubmitButton'
import FileUploadButtons from '@/components/FileUploadButtons'
import {
  Button,
  Card,
  DataTable,
  EmptyState,
  Field,
  Input,
  Notice,
  PageHeader,
  Select,
  checkboxClasses,
  type Column,
} from '@/components/ui'
import { assignExpenseToJob, deleteExpense, uploadExpense } from './actions'

type JobOption = { id: string; job_number: string | null }

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error: actionError } = await searchParams
  const supabase = await createClient()
  const profile = await getCurrentProfile(supabase)
  const { modules_expenses_enabled } = await getCompanyModules(supabase)
  if (!profile || !isCompanyAccount(profile.role) || !modules_expenses_enabled) redirect('/jobs')

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

  const assignedColumns: Column<(typeof assigned)[number]>[] = [
    {
      key: 'job',
      header: 'Job',
      mobile: 'title',
      cell: (expense) =>
        expense.job_id ? (
          <a href={`/jobs/${expense.job_id}`} className="text-accent hover:opacity-80">
            {jobsById.get(expense.job_id)?.job_number ?? expense.job_id}
          </a>
        ) : (
          '—'
        ),
    },
    {
      key: 'amount',
      header: 'Amount',
      mobile: 'meta',
      cell: (expense) => formatMoney(Number(expense.amount), currency),
    },
    { key: 'description', header: 'Description', cell: (expense) => expense.description },
    {
      key: 'receipt',
      header: 'Receipt',
      cell: (expense) =>
        expense.signedUrl ? (
          <a href={expense.signedUrl} target="_blank" rel="noreferrer" className="text-accent">
            View
          </a>
        ) : (
          '—'
        ),
    },
  ]

  return (
    <div className="flex flex-col gap-8">
      {actionError && <Notice tone="error">{actionError}</Notice>}

      <PageHeader
        title="Expenses"
        description="Upload a receipt or invoice, then assign it to a job to add it as a cost."
      />

      <Card>
        <h2 className="mb-4 text-sm font-medium">Upload receipt</h2>
        <FileUploadButtons
          action={uploadExpense}
          accept="image/*,application/pdf"
          camera
          label="Upload receipt"
        />
      </Card>

      <Card>
        <h2 className="mb-4 text-sm font-medium">Unassigned ({unassigned.length})</h2>

        {unassigned.length === 0 ? (
          <EmptyState title="No unassigned expenses." />
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

                  <form
                    action={boundAssign}
                    className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
                  >
                    <Field
                      label="Description"
                      htmlFor={`description-${expense.id}`}
                      required
                      className="min-w-[200px] flex-1"
                    >
                      <Input
                        id={`description-${expense.id}`}
                        name="description"
                        type="text"
                        defaultValue={expense.description}
                        required
                      />
                    </Field>
                    <Field label="Amount paid" htmlFor={`amount-${expense.id}`}>
                      <Input
                        id={`amount-${expense.id}`}
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
                      {tax_label} applies ({default_tax_rate}%)
                    </label>
                    <Field label="Type" htmlFor={`type-${expense.id}`}>
                      <Select id={`type-${expense.id}`} name="type" defaultValue="material">
                        <option value="material">Material</option>
                        <option value="labour">Labour</option>
                      </Select>
                    </Field>
                    <Field label="Job" htmlFor={`job-${expense.id}`} required>
                      <Select id={`job-${expense.id}`} name="job_id" required>
                        <option value="">Select a job…</option>
                        {jobs.map((job) => (
                          <option key={job.id} value={job.id}>
                            {job.job_number ?? job.id}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Button type="submit" variant="primary">
                      Assign to job
                    </Button>
                  </form>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-4 text-sm font-medium">Assigned ({assigned.length})</h2>

        {/* No row href here: each card carries two distinct destinations (the
            job and the receipt), which an overlay link would swallow. */}
        <DataTable
          columns={assignedColumns}
          rows={assigned}
          getRowKey={(expense) => expense.id}
          empty={<EmptyState title="No assigned expenses yet." />}
        />
      </Card>
    </div>
  )
}
