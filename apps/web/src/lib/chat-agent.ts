import Anthropic from '@anthropic-ai/sdk'
import type { createClient } from '@/lib/supabase/server'
import type { Profile } from '@trade-assist/db'
import { LINE_ITEM_TYPES } from '@trade-assist/db'
import { isCompanyAccount } from '@/lib/roles'
import { createJobRecord } from '@/lib/job-create'
import { logJobAudit } from '@/lib/audit'
import { planRoute, applyRoute } from '@/app/(app)/calendar/route-actions'
import { eventsAvailable } from '@/lib/events'
import {
  STAFFOPS_TOOLS,
  executeStaffOpsTool,
  type ChatClock,
} from '@/lib/chat-staffops-tools'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

const MODEL = 'claude-haiku-4-5-20251001'
const MAX_TOOL_ITERATIONS = 6
const HISTORY_LIMIT = 30

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_schedule',
    description:
      'List jobs scheduled between two dates (inclusive, max 31 days apart). Returns job number, customer, status, dates, times, and address.',
    input_schema: {
      type: 'object',
      properties: {
        from_date: { type: 'string', description: 'Range start, YYYY-MM-DD.' },
        to_date: { type: 'string', description: 'Range end, YYYY-MM-DD.' },
      },
      required: ['from_date', 'to_date'],
    },
  },
  {
    name: 'get_job_details',
    description: 'Full details for one job by its job number (e.g. JOB-0001): customer contact, schedule, status, quote/invoice status, total costs.',
    input_schema: {
      type: 'object',
      properties: {
        job_number: { type: 'string', description: 'The job number, e.g. JOB-0001.' },
      },
      required: ['job_number'],
    },
  },
  {
    name: 'create_job',
    description:
      'Create a new job (and the customer, if they are new). Resolve relative dates ("tomorrow", "next Tuesday") to YYYY-MM-DD and times to 24-hour HH:MM before calling. Never invent details the user did not give — omit unknown fields. Customer name is required; ask for it if missing.',
    input_schema: {
      type: 'object',
      properties: {
        customer_name: { type: 'string' },
        customer_phone: { type: 'string' },
        customer_email: { type: 'string' },
        address_line: { type: 'string', description: 'Job site address.' },
        start_date: { type: 'string', description: 'YYYY-MM-DD' },
        start_time: { type: 'string', description: '24-hour HH:MM' },
        finish_date: { type: 'string', description: 'YYYY-MM-DD' },
        finish_time: { type: 'string', description: '24-hour HH:MM' },
        notes: { type: 'string', description: 'Job description / special instructions.' },
      },
      required: ['customer_name'],
    },
  },
  {
    name: 'draft_line_items',
    description:
      "Add line items to a job's current DRAFT quote or invoice. Item types: labour (quantity=hours, unit_price=hourly rate), materials, callout (quantity always 1), other. If a price is not stated, use 0 — never guess prices. Fails with guidance if the job has no draft quote/invoice.",
    input_schema: {
      type: 'object',
      properties: {
        job_number: { type: 'string' },
        target: { type: 'string', enum: ['quote', 'invoice'] },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              item_type: { type: 'string', enum: [...LINE_ITEM_TYPES] },
              description: { type: 'string' },
              quantity: { type: 'number' },
              unit_price: { type: 'number' },
            },
            required: ['item_type', 'description', 'quantity', 'unit_price'],
          },
        },
      },
      required: ['job_number', 'target', 'items'],
    },
  },
  {
    name: 'plan_route',
    description:
      "Plan the most time-efficient driving order for a day's jobs (needs 2+ jobs with geocoded addresses that day). Returns suggested visit order with times and travel minutes. Present the plan and ask before applying it.",
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD' },
      },
      required: ['date'],
    },
  },
  {
    name: 'apply_route',
    description:
      'Apply a planned route: set each listed job (by job number) to the given start/finish times. Only call after the user confirms the plan, and only report success if this tool returns applied.',
    input_schema: {
      type: 'object',
      properties: {
        updates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              job_number: { type: 'string', description: 'e.g. JOB-0001' },
              start_time: { type: 'string', description: 'HH:MM' },
              finish_time: { type: 'string', description: 'HH:MM' },
            },
            required: ['job_number', 'start_time', 'finish_time'],
          },
        },
      },
      required: ['updates'],
    },
  },
  {
    name: 'submit_feedback',
    description:
      'Send feedback to the BusinessOps development team. Use category "idea" for feature ideas/improvements and "support" for problems/bugs/help requests. Use this whenever the user starts a message with @idea or @support, or clearly wants to report something to the developers.',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['idea', 'support'] },
        message: { type: 'string', description: 'The feedback itself, without the @tag.' },
      },
      required: ['category', 'message'],
    },
  },
]

function clean(value: unknown): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed ? trimmed : null
}

async function executeTool(
  supabase: SupabaseClient,
  profile: Profile,
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  try {
    switch (name) {
      case 'get_schedule': {
        const from = String(input.from_date ?? '')
        const to = String(input.to_date ?? '')
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) {
          return JSON.stringify({ error: 'Invalid date range.' })
        }
        const { data, error } = await supabase
          .from('jobs')
          .select('job_number, status, address_line, start_date, start_time, finish_date, finish_time, customer:customers(name)')
          .lte('start_date', to)
          .or(`finish_date.gte.${from},and(finish_date.is.null,start_date.gte.${from})`)
          .order('start_date')
          .limit(50)
        if (error) return JSON.stringify({ error: error.message })
        return JSON.stringify({ jobs: data ?? [] })
      }

      case 'get_job_details': {
        const jobNumber = String(input.job_number ?? '').trim()
        const { data: job, error } = await supabase
          .from('jobs')
          .select(
            'id, job_number, status, address_line, notes, start_date, start_time, finish_date, finish_time, customer:customers(name, email, phone, address), quotes(status, total, superseded_at), invoices(status, total, tax_amount, superseded_at), cost_entries(total_cost)'
          )
          .ilike('job_number', jobNumber)
          .maybeSingle()
        if (error) return JSON.stringify({ error: error.message })
        if (!job) return JSON.stringify({ error: `No job ${jobNumber} found (or you don't have access to it).` })
        const costsTotal = (job.cost_entries as { total_cost: number }[]).reduce(
          (sum, c) => sum + Number(c.total_cost),
          0
        )
        return JSON.stringify({
          ...job,
          cost_entries: undefined,
          costs_total: costsTotal,
          quotes: (job.quotes as { superseded_at: string | null }[]).filter((q) => !q.superseded_at),
          invoices: (job.invoices as { superseded_at: string | null }[]).filter((i) => !i.superseded_at),
        })
      }

      case 'create_job': {
        const result = await createJobRecord(supabase, {
          customerName: String(input.customer_name ?? ''),
          customerPhone: clean(input.customer_phone),
          customerEmail: clean(input.customer_email),
          addressLine: clean(input.address_line),
          startDate: clean(input.start_date),
          startTime: clean(input.start_time),
          finishDate: clean(input.finish_date),
          finishTime: clean(input.finish_time),
          notes: clean(input.notes),
        })
        return JSON.stringify(result)
      }

      case 'draft_line_items': {
        const jobNumber = String(input.job_number ?? '').trim()
        const target = String(input.target ?? '')
        const items = (Array.isArray(input.items) ? input.items : []) as {
          item_type: string
          description: string
          quantity: number
          unit_price: number
        }[]

        if (!['quote', 'invoice'].includes(target)) return JSON.stringify({ error: 'Invalid target.' })
        if (items.length === 0) return JSON.stringify({ error: 'No items given.' })
        if (items.some((i) => !LINE_ITEM_TYPES.includes(i.item_type as (typeof LINE_ITEM_TYPES)[number]))) {
          return JSON.stringify({ error: 'Invalid item_type.' })
        }

        const { data: job } = await supabase
          .from('jobs')
          .select('id, job_number')
          .ilike('job_number', jobNumber)
          .maybeSingle()
        if (!job) return JSON.stringify({ error: `No job ${jobNumber} found.` })

        const table = target === 'quote' ? 'quotes' : 'invoices'
        const { data: doc } = await supabase
          .from(table)
          .select('id')
          .eq('job_id', job.id)
          .eq('status', 'draft')
          .is('superseded_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!doc) {
          return JSON.stringify({
            error: `${job.job_number} has no draft ${target}. The user needs to create or edit a ${target} on the job page first, then I can add items to it.`,
          })
        }

        const itemsTable = target === 'quote' ? 'quote_line_items' : 'invoice_line_items'
        const fk = target === 'quote' ? 'quote_id' : 'invoice_id'
        const { error } = await supabase.from(itemsTable).insert(
          items.map((item) => ({
            [fk]: doc.id,
            item_type: item.item_type,
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
          }))
        )
        if (error) return JSON.stringify({ error: error.message })

        await logJobAudit(supabase, job.id, `Added ${items.length} ${target} line item${items.length === 1 ? '' : 's'} via assistant`)
        return JSON.stringify({ added: items.length, target, job_number: job.job_number, job_id: job.id })
      }

      case 'plan_route': {
        const date = String(input.date ?? '')
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return JSON.stringify({ error: 'Invalid date.' })
        const result = await planRoute(date)
        return JSON.stringify(result)
      }

      case 'apply_route': {
        const canSchedule = isCompanyAccount(profile.role) || Boolean(profile.can_schedule)
        if (!canSchedule) {
          return JSON.stringify({ error: "You don't have the scheduling permission, so I can't apply this." })
        }
        const updates = (Array.isArray(input.updates) ? input.updates : []) as {
          job_number: string
          start_time: string
          finish_time: string
        }[]
        if (updates.length === 0) return JSON.stringify({ error: 'No updates given.' })
        if (updates.some((u) => !/^\d{2}:\d{2}$/.test(u.start_time) || !/^\d{2}:\d{2}$/.test(u.finish_time))) {
          return JSON.stringify({ error: 'Times must be HH:MM.' })
        }

        // The agent works in job numbers; resolve them to ids here.
        const { data: jobRows } = await supabase
          .from('jobs')
          .select('id, job_number')
          .in('job_number', updates.map((u) => u.job_number))
        const idByNumber = new Map((jobRows ?? []).map((j) => [j.job_number as string, j.id as string]))

        const missing = updates.filter((u) => !idByNumber.has(u.job_number)).map((u) => u.job_number)
        if (missing.length > 0) {
          return JSON.stringify({ error: `Job(s) not found: ${missing.join(', ')}.` })
        }

        await applyRoute(
          updates.map((u) => ({
            jobId: idByNumber.get(u.job_number)!,
            startTime: u.start_time,
            finishTime: u.finish_time,
          }))
        )
        return JSON.stringify({ applied: updates.length })
      }

      case 'submit_feedback': {
        const category = String(input.category ?? '')
        const message = String(input.message ?? '').trim()
        if (!['idea', 'support'].includes(category) || !message) {
          return JSON.stringify({ error: 'Invalid feedback.' })
        }
        const { error } = await supabase.from('feedback_messages').insert({
          company_id: profile.company_id,
          user_id: profile.id,
          category,
          message,
        })
        if (error) return JSON.stringify({ error: error.message })
        return JSON.stringify({ submitted: true, category })
      }

      default:
        return JSON.stringify({ error: `Unknown tool ${name}.` })
    }
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : 'Tool failed.' })
  }
}

function buildSystemPrompt(profile: Profile, clock: ChatClock, staffOps: boolean): string {
  // The user's own date, not the server's. At 9am in Auckland the server is
  // still on yesterday, and an assistant that books "tomorrow" a day early is
  // worse than one that refuses.
  const today = clock.localDate
  const isCompany = isCompanyAccount(profile.role)
  return [
    `You are the BusinessOps assistant, built into a job-management app for trade businesses. You are talking to ${profile.full_name ?? 'a user'} (${isCompany ? 'the Company account — full access' : 'a staff member'}). Today's date is ${today}.`,
    ...(staffOps
      ? [
          'This company also uses StaffOps for events and rostering. You can list departments and their members (list_departments), read the roster (get_roster), create events with their pack-in, show and pack-out days (create_event), create shifts (create_shift), and ask named people to work a shift (roster_staff).',
          'Always call list_departments before creating a shift or rostering anyone, so you use real department names and real people rather than guessing. Give shift times as the local times the user said — do not convert them.',
          'A department with members_visible false is one this user cannot see into. Say its members are not visible to them. NEVER say such a department is empty, has nobody, or has no one assigned — you do not know that, and saying it would be false.',
          'Rostering someone ASKS them; it does not put them on. They accept or decline and a manager confirms who actually works it. Say that plainly rather than implying someone is booked. For a shift needing several people out of a larger pool, suggest open_to_department so anyone in it can offer.',
        ]
      : []),
    'You can: answer questions about their jobs and schedule (get_schedule, get_job_details), create jobs (create_job), add line items to draft quotes/invoices (draft_line_items), plan and apply efficient driving routes for a day (plan_route, then apply_route only after the user confirms), and send feedback to the development team (submit_feedback).',
    'If a message starts with @idea or @support, submit it as feedback with that category (strip the tag) and confirm it was passed to the development team. Also offer submit_feedback when the user describes a bug or wishes the app did something.',
    'Resolve relative dates ("tomorrow", "next Tuesday") yourself before calling tools. Never invent customer details, prices, or times the user did not give — unstated prices are 0, unknown fields stay empty, and ask when something essential is missing.',
    'Data access is permission-scoped: if a lookup returns nothing, the job may not exist or the user may not have access — say so plainly.',
    'Never claim an action was performed unless you actually called the tool in this turn and it returned success. Earlier tool results are not available in later turns — re-run a tool if you need its data again.',
    'A tool result containing "ok": false means THE ACTION DID NOT HAPPEN. Never say Done, Created, Added, Set up or Rostered after one. Relay its "tell_the_user" text to the user instead, in your own words but without softening it. Permission refusals are normal and expected — report them plainly rather than treating them as something to work around.',
    'Keep replies short and practical, like a helpful office manager. Use plain text, no markdown tables.',
  ].join('\n\n')
}

export async function runChatAgent(
  supabase: SupabaseClient,
  profile: Profile,
  userMessage: string,
  clock: ChatClock = { tzOffsetMinutes: 0, localDate: new Date().toISOString().slice(0, 10) }
): Promise<{ reply: string }> {
  await supabase.from('chat_messages').insert({
    company_id: profile.company_id,
    profile_id: profile.id,
    role: 'user',
    content: userMessage,
  })

  let reply: string

  if (!process.env.ANTHROPIC_API_KEY) {
    reply = 'The assistant is not configured yet (missing AI key). Your message was saved.'
  } else {
    try {
      const { data: historyData } = await supabase
        .from('chat_messages')
        .select('role, content')
        .eq('profile_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(HISTORY_LIMIT)

      const history = (historyData ?? []).reverse() as { role: 'user' | 'assistant'; content: string }[]

      const messages: Anthropic.MessageParam[] = history.map((m) => ({
        role: m.role,
        content: m.content,
      }))

      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

      // StaffOps tools are only offered where the product is available. A trades
      // business should not pay tokens for tool definitions about departments it
      // does not have, nor be told the assistant can roster.
      const staffOps = await eventsAvailable(supabase)
      const system = buildSystemPrompt(profile, clock, staffOps)
      const tools = staffOps ? [...TOOLS, ...STAFFOPS_TOOLS] : TOOLS

      let response = await client.messages.create({
        model: MODEL,
        max_tokens: 1500,
        system,
        tools,
        messages,
      })

      let iterations = 0
      while (response.stop_reason === 'tool_use' && iterations < MAX_TOOL_ITERATIONS) {
        iterations += 1
        const toolResults: Anthropic.ToolResultBlockParam[] = []

        for (const block of response.content) {
          if (block.type !== 'tool_use') continue
          const input = block.input as Record<string, unknown>
          // StaffOps tools first; it returns null for anything it does not own,
          // which falls through to the BusinessOps set.
          const result =
            (staffOps ? await executeStaffOpsTool(supabase, profile, block.name, input, clock) : null) ??
            (await executeTool(supabase, profile, block.name, input))
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })
        }

        messages.push({ role: 'assistant', content: response.content })
        messages.push({ role: 'user', content: toolResults })

        response = await client.messages.create({
          model: MODEL,
          max_tokens: 1500,
          system,
          tools,
          messages,
        })
      }

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim()

      reply = text || 'Done.'
    } catch {
      reply = 'Sorry — something went wrong on my end. Try that again in a moment.'
    }
  }

  await supabase.from('chat_messages').insert({
    company_id: profile.company_id,
    profile_id: profile.id,
    role: 'assistant',
    content: reply,
  })

  return { reply }
}
