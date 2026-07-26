import type { Customer, Job } from '@trade-assist/db'

export type JobWithCustomer = Job & { customer: Pick<Customer, 'id' | 'name'> | null }
