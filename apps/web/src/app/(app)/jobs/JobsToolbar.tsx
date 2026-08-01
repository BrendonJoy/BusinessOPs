'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input, Select } from '@/components/ui'

type StatusOption = { value: string; label: string }

export default function JobsToolbar({
  view,
  q,
  status,
  sort,
  dir,
  statusOptions,
}: {
  view: string
  q: string
  status: string
  sort: string
  dir: string
  statusOptions: StatusOption[]
}) {
  const router = useRouter()
  const [search, setSearch] = useState(q)

  function buildUrl(params: { q?: string; status?: string }) {
    const query = new URLSearchParams()
    query.set('view', view)
    const nextQ = params.q ?? search
    const nextStatus = params.status ?? status
    if (nextQ) query.set('q', nextQ)
    if (nextStatus) query.set('status', nextStatus)
    if (sort) query.set('sort', sort)
    if (dir) query.set('dir', dir)
    return `/jobs?${query.toString()}`
  }

  return (
    <form
      className="mb-6 flex flex-wrap gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        router.push(buildUrl({}))
      }}
    >
      <Input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search job number, customer, address..."
        aria-label="Search jobs"
        className="min-w-[240px] flex-1"
      />
      {statusOptions.length > 0 && (
        <Select
          value={status}
          onChange={(e) => router.push(buildUrl({ status: e.target.value }))}
          aria-label="Filter by status"
        >
          <option value="">All active statuses</option>
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      )}
      <Button type="submit">Search</Button>
    </form>
  )
}
