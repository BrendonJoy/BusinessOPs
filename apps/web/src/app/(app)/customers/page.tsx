import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Customer } from '@trade-assist/db'
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

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Customers</h1>
        <p className="text-sm text-muted">View and update your saved customer details.</p>
      </div>

      {error && <p className="rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{error}</p>}

      <section className="rounded-lg border border-surface-border p-4">
        <h2 className="mb-4 text-sm font-medium">Add customer</h2>
        <form action={createCustomer} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="name" className="text-xs font-medium">
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-xs font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="phone" className="text-xs font-medium">
              Phone
            </label>
            <input
              id="phone"
              name="phone"
              type="text"
              className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex min-w-[200px] flex-1 flex-col gap-1">
            <label htmlFor="address" className="text-xs font-medium">
              Address
            </label>
            <input
              id="address"
              name="address"
              type="text"
              className="w-full rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
          >
            Add customer
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-surface-border p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium">All customers ({filtered.length})</h2>
          <form method="get" className="flex gap-2">
            <input
              type="text"
              name="q"
              defaultValue={q ?? ''}
              placeholder="Search customers…"
              className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-md border border-surface-border px-3 py-2 text-sm font-medium hover:border-accent"
            >
              Search
            </button>
          </form>
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-muted">
            {q ? 'No customers match your search.' : 'No customers yet.'}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-surface-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Phone</th>
                  <th className="px-4 py-2 font-medium">Address</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-t border-surface-border hover:bg-surface">
                    <td className="px-4 py-2 font-medium">{c.name}</td>
                    <td className="px-4 py-2">{c.email ?? '—'}</td>
                    <td className="px-4 py-2">{c.phone ?? '—'}</td>
                    <td className="px-4 py-2">{c.address ?? '—'}</td>
                    <td className="px-4 py-2 text-right">
                      <Link href={`/customers/${c.id}`} className="text-accent hover:opacity-80">
                        View / Edit
                      </Link>
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
