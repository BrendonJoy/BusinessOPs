export type JobStatus = 'quoted' | 'scheduled' | 'in_progress' | 'completed' | 'invoiced' | 'cancelled'
export type CostEntryType = 'material' | 'labour'
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined'
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue'

export interface Company {
  id: string
  name: string
  job_seq: number
  gst_number: string | null
  address: string | null
  logo_url: string | null
  currency: string
  tax_label: string
  default_tax_rate: number
  gst_registered: boolean
  payment_details: string | null
  calendar_token: string
  created_at: string
}

export interface Profile {
  id: string
  company_id: string
  full_name: string | null
  role: 'owner' | 'admin' | 'staff'
  created_at: string
}

export interface Customer {
  id: string
  company_id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  notes: string | null
  created_at: string
}

export interface Job {
  id: string
  company_id: string
  job_number: string | null
  customer_id: string | null
  assigned_user_id: string | null
  status: JobStatus
  address_line: string | null
  geo_lat: number | null
  geo_lng: number | null
  notes: string | null
  start_date: string | null
  finish_date: string | null
  start_time: string | null
  finish_time: string | null
  created_at: string
  updated_at: string
}

export interface JobFile {
  id: string
  job_id: string
  file_url: string
  file_type: string | null
  uploaded_at: string
}

export interface CostEntry {
  id: string
  job_id: string
  type: CostEntryType
  description: string
  quantity: number
  unit_cost: number
  total_cost: number
  invoiced_at: string | null
  created_at: string
}

export interface Quote {
  id: string
  job_id: string
  status: QuoteStatus
  share_token: string | null
  total: number
  deposit_percent: number
  tax_rate: number
  tax_amount: number
  superseded_at: string | null
  replaces_quote_id: string | null
  created_at: string
  sent_at: string | null
  responded_at: string | null
}

export interface QuoteLineItem {
  id: string
  quote_id: string
  description: string
  quantity: number
  unit_price: number
  line_total: number
  created_at: string
}

export interface Invoice {
  id: string
  job_id: string
  status: InvoiceStatus
  total: number
  tax_rate: number
  tax_amount: number
  quote_id: string | null
  superseded_at: string | null
  replaces_invoice_id: string | null
  created_at: string
  sent_at: string | null
}

export interface InvoiceLineItem {
  id: string
  invoice_id: string
  description: string
  quantity: number
  unit_price: number
  line_total: number
  source: 'material' | 'labour' | 'manual' | 'deposit'
  cost_entry_id: string | null
  created_at: string
}

export interface Expense {
  id: string
  company_id: string
  job_id: string | null
  cost_entry_id: string | null
  file_path: string
  file_type: string | null
  description: string
  amount: number
  created_at: string
}

export type FeedbackCategory = 'idea' | 'support'
export type FeedbackStatus = 'new' | 'read' | 'resolved'

export interface FeedbackMessage {
  id: string
  company_id: string
  user_id: string | null
  category: FeedbackCategory
  message: string
  ai_summary: string | null
  status: FeedbackStatus
  created_at: string
}

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  idea: 'Idea',
  support: 'Support',
}

export const FEEDBACK_STATUSES: FeedbackStatus[] = ['new', 'read', 'resolved']

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: 'New',
  read: 'Read',
  resolved: 'Resolved',
}

export const JOB_STATUSES: JobStatus[] = [
  'quoted',
  'scheduled',
  'in_progress',
  'completed',
  'invoiced',
  'cancelled',
]

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  quoted: 'Quoted',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  invoiced: 'Invoiced',
  cancelled: 'Cancelled',
}

export const JOB_STATUS_GROUPS: Record<'active' | 'completed' | 'cancelled', JobStatus[]> = {
  active: ['quoted', 'scheduled', 'in_progress'],
  completed: ['completed', 'invoiced'],
  cancelled: ['cancelled'],
}

export const CURRENCIES = [
  { code: 'USD', label: 'US Dollar (USD)' },
  { code: 'AUD', label: 'Australian Dollar (AUD)' },
  { code: 'NZD', label: 'New Zealand Dollar (NZD)' },
  { code: 'GBP', label: 'British Pound (GBP)' },
  { code: 'EUR', label: 'Euro (EUR)' },
  { code: 'CAD', label: 'Canadian Dollar (CAD)' },
] as const
