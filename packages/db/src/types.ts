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
  modules_quotes_enabled: boolean
  modules_invoicing_enabled: boolean
  modules_expenses_enabled: boolean
  modules_reports_enabled: boolean
  modules_timesheets_enabled: boolean
  /** StaffOps: events, departments and rostering. Off unless switched on. */
  modules_events_enabled: boolean
  geofence_enabled: boolean
  geofence_radius_meters: number
  workday_enforced: boolean
  workday_start: string
  workday_end: string
  workday_days: number[]
  job_prefix: string
  pay_cycle_length: PayCycleLength
  pay_cycle_anchor: string | null
  created_at: string
}

export type PayCycleLength = 'weekly' | 'fortnightly' | 'monthly'

export const PAY_CYCLE_LENGTHS: PayCycleLength[] = ['weekly', 'fortnightly', 'monthly']

export const PAY_CYCLE_LENGTH_LABELS: Record<PayCycleLength, string> = {
  weekly: 'Weekly',
  fortnightly: 'Fortnightly',
  monthly: 'Monthly',
}

// ISO weekday numbering: 1 = Monday .. 7 = Sunday (matches companies.workday_days).
export const WORKDAY_DAY_LABELS: Record<number, string> = {
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
  7: 'Sun',
}

export type AccessLevel = 'hidden' | 'view' | 'full'

export interface StaffPermissions {
  can_view_all_jobs: boolean
  can_edit_jobs: boolean
  quotes_access: AccessLevel
  invoices_access: AccessLevel
  can_log_expenses: boolean
  can_view_reports: boolean
  can_schedule: boolean
}

export interface Profile extends StaffPermissions {
  id: string
  company_id: string
  full_name: string | null
  /** Access level, not an occupation — drives permissions and RLS. */
  role: 'company' | 'staff'
  /** Occupation, e.g. "Electrician". Descriptive only; no effect on access. */
  job_title: string | null
  email: string
  created_at: string
}

export interface CompanyInvite extends StaffPermissions {
  id: string
  company_id: string
  email: string
  role: 'staff'
  token: string
  invited_by: string | null
  job_title: string | null
  pay_rate: number | null
  /** Null until chosen — distinct from 'salaried', which is a decision. */
  pay_type: PayType | null
  created_at: string
  expires_at: string
  accepted_at: string | null
}

/**
 * Salaried staff are rostered like anyone else but carry no hourly rate, so no
 * labour cost is recorded when they clock out. Managers at a venue are usually
 * salaried while the people they roster are casual and hourly.
 */
export type PayType = 'hourly' | 'salaried'

export interface StaffPayRate {
  profile_id: string
  /** Null exactly when pay_type is 'salaried'; enforced by a check constraint. */
  pay_rate: number | null
  pay_type: PayType
  updated_at: string
}

/**
 * StaffOps. An event runs over one or more days, and the kind of day changes
 * how it is staffed: a pack-in needs crew, a show day needs front of house.
 */
export const EVENT_DAY_TYPES = ['pack_in', 'event', 'pack_out'] as const
export type EventDayType = (typeof EVENT_DAY_TYPES)[number]

export const EVENT_DAY_TYPE_LABELS: Record<EventDayType, string> = {
  pack_in: 'Pack-in',
  event: 'Event day',
  pack_out: 'Pack-out',
}

/**
 * A place work happens. Carries the coordinates shift clock-ins are fenced
 * against — an event's venue used to be free text, which is a label rather than
 * a location, and dark-day shifts have no event to borrow one from.
 */
export interface Venue {
  id: string
  company_id: string
  name: string
  address: string | null
  geo_lat: number | null
  geo_lng: number | null
  created_at: string
}

export interface EventRecord {
  id: string
  company_id: string
  name: string
  venue_id: string | null
  notes: string | null
  created_at: string
}

export interface EventDay {
  id: string
  event_id: string
  company_id: string
  day_date: string
  day_type: EventDayType
  notes: string | null
}

export interface Team {
  id: string
  company_id: string
  name: string
  created_at: string
}

export type TeamRole = 'manager' | 'staff'

export interface TeamMembership {
  team_id: string
  profile_id: string
  role: TeamRole
  created_at: string
}

export interface Shift {
  id: string
  company_id: string
  team_id: string
  event_day_id: string | null
  /** Set directly on dark-day shifts; event shifts normally inherit the event's. */
  venue_id: string | null
  title: string | null
  starts_at: string
  ends_at: string
  /** The day the shift belongs to, as the venue means it. See migration 0038. */
  local_date: string
  positions_needed: number
  /** Whether anyone in the department may volunteer, or the manager fills it by name. */
  open_to_department: boolean
  notes: string | null
  created_at: string
}

/**
 * Where a person stands on a shift.
 *
 * 'available' and 'confirmed' are deliberately different: more people can offer
 * than there are places, which is the entire point of an open call, so saying
 * yes is not the same as being on the roster.
 */
export const SHIFT_ASSIGNMENT_STATUSES = ['invited', 'available', 'declined', 'confirmed'] as const
export type ShiftAssignmentStatus = (typeof SHIFT_ASSIGNMENT_STATUSES)[number]

export const SHIFT_ASSIGNMENT_STATUS_LABELS: Record<ShiftAssignmentStatus, string> = {
  invited: 'Asked',
  available: 'Available',
  declined: 'Declined',
  confirmed: 'Confirmed',
}

export type TimesheetMiscCategory = 'travel' | 'admin' | 'break' | 'other'

export const TIMESHEET_MISC_CATEGORIES: TimesheetMiscCategory[] = ['travel', 'admin', 'break', 'other']

export const TIMESHEET_MISC_CATEGORY_LABELS: Record<TimesheetMiscCategory, string> = {
  travel: 'Travel',
  admin: 'Admin',
  break: 'Break',
  other: 'Other',
}

export interface TimesheetEntry {
  id: string
  company_id: string
  profile_id: string
  job_id: string | null
  misc_category: TimesheetMiscCategory | null
  clock_in: string
  clock_out: string | null
  // No location columns by design — coordinates are used once for the geofence
  // check and never stored. See migration 0030.
  cost_entry_id: string | null
  day_id: string | null
  created_at: string
}

export type TimesheetDayStatus = 'submitted' | 'approved'

export interface TimesheetDay {
  id: string
  company_id: string
  profile_id: string
  work_date: string
  status: TimesheetDayStatus
  submitted_at: string
  approved_at: string | null
  approved_by: string | null
}

export interface PayrollPeriod {
  id: string
  company_id: string
  period_start: string
  period_end: string
  approved_at: string
  approved_by: string | null
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

export type LineItemType = 'labour' | 'material' | 'callout' | 'other'

export const LINE_ITEM_TYPES: LineItemType[] = ['labour', 'material', 'callout', 'other']

export const LINE_ITEM_TYPE_LABELS: Record<LineItemType, string> = {
  labour: 'Labour',
  material: 'Materials',
  callout: 'Callout fee',
  other: 'Other',
}

export interface QuoteLineItem {
  id: string
  quote_id: string
  description: string
  quantity: number
  unit_price: number
  line_total: number
  item_type: LineItemType
  created_at: string
}

export type InvoiceType = 'standard' | 'deposit' | 'final'

export const INVOICE_TYPE_LABELS: Record<InvoiceType, string> = {
  standard: 'Invoice',
  deposit: 'Deposit invoice',
  final: 'Final invoice',
}

export interface Invoice {
  id: string
  job_id: string
  status: InvoiceStatus
  invoice_type: InvoiceType
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
  item_type: LineItemType
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

export type FeedbackUrgentItem = {
  message_id: string
  reason: string
}

export interface FeedbackDigest {
  id: string
  generated_at: string
  message_count: number
  summary: string
  urgent_items: FeedbackUrgentItem[]
  suggested_actions: FeedbackSuggestedAction[]
}

export interface FeedbackSuggestedAction {
  title: string
  suggestion: string
}

export interface ChatMessage {
  id: string
  company_id: string
  profile_id: string
  role: 'user' | 'assistant'
  content: string
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
