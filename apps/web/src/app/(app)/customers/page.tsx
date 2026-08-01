import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Customer } from '@trade-assist/db'
import {
  Button,
  Card,
  DataTable,
  EmptyState,
  Field,
  Input,
  Notice,
  PageHeader,
  type Column,
} from '@/components/ui'
import { createCustomer } from './actions'

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; q?: string }>
}) {
  const { error, q } = await searchParams
  const supabase = await createClient()

  const { data } = await supabase.from('customers').select('*').order('name', { ascending: true })
  const customers = (data ?? []) as Customer[]

  const filtered = q
    ? customers.filter((c) => {
        const needle = q.toLowerCase()
        return [c.name, c.email, c.phone, c.address]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(needle)
      })
    : customers

  const columns: Column<Customer>[] = [
    { key: 'name', header: 'Name', mobile: 'title', className: 'font-medium', cell: (c) => c.name },
    { key: 'email', header: 'Email', cell: (c) => c.email ?? '—' },
    { key: 'phone', header: 'Phone', cell: (c) => c.phone ?? '—' },
    { key: 'address', header: 'Address', cell: (c) => c.address ?? '—' },
    {
      key: 'actions',
      header: '',
      // The whole card is already tappable on mobile, so this would be a
      // redundant second link — and it sits under the card's overlay anyway.
      mobile: 'hidden',
      className: 'text-right',
      cell: (c) => (
        <Link href={`/customers/${c.id}`} className="text-accent hover:opacity-80">
          View / Edit
        </Link>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Customers"
        description="View and update your saved customer details."
      />

      {error && <Notice tone="error">{error}</Notice>}

      <Card>
        <h2 className="mb-4 text-sm font-medium">Add customer</h2>
        <form action={createCustomer} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <Field label="Name" htmlFor="name" required className="sm:w-auto">
            <Input id="name" name="name" type="text" required />
          </Field>
          <Field label="Email" htmlFor="email" className="sm:w-auto">
            <Input id="email" name="email" type="email" />
          </Field>
          <Field label="Phone" htmlFor="phone" className="sm:w-auto">
            <Input id="phone" name="phone" type="tel" />
          </Field>
          <Field label="Address" htmlFor="address" className="min-w-[200px] flex-1">
            <Input id="address" name="address" type="text" />
          </Field>
          <Button type="submit" variant="primary">
            Add customer
          </Button>
        </form>
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium">All customers ({filtered.length})</h2>
          <form method="get" className="flex w-full gap-2 sm:w-auto">
            <Input
              type="search"
              name="q"
              defaultValue={q ?? ''}
              placeholder="Search customers…"
              aria-label="Search customers"
              className="min-w-0"
            />
            <Button type="submit" className="shrink-0">
              Search
            </Button>
          </form>
        </div>

        <DataTable
          columns={columns}
          rows={filtered}
          getRowKey={(c) => c.id}
          getRowHref={(c) => `/customers/${c.id}`}
          empty={
            <EmptyState title={q ? 'No customers match your search.' : 'No customers yet.'} />
          }
        />
      </Card>
    </div>
  )
}
