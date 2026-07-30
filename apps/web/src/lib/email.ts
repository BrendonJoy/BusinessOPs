import { Resend } from 'resend'

let client: Resend | null = null

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null
  if (!client) client = new Resend(apiKey)
  return client
}

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'BusinessOps <onboarding@resend.dev>'

type SendResult = { sent: true } | { sent: false; reason: 'not_configured' | 'send_failed'; message?: string }

export async function sendQuoteEmail(params: {
  to: string
  customerName: string
  companyName: string
  jobNumber: string
  total: string
  quoteUrl: string
  replyTo?: string
}): Promise<SendResult> {
  const resend = getResendClient()
  if (!resend) return { sent: false, reason: 'not_configured' }

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    replyTo: params.replyTo,
    to: params.to,
    subject: `Quote from ${params.companyName} — ${params.jobNumber}`,
    html: `
      <p>Hi ${params.customerName},</p>
      <p>${params.companyName} has sent you a quote for ${params.jobNumber}, total ${params.total}.</p>
      <p><a href="${params.quoteUrl}">View and respond to the quote</a></p>
    `,
  })

  if (error) return { sent: false, reason: 'send_failed', message: error.message }
  return { sent: true }
}

export async function sendTeamInviteEmail(params: {
  to: string
  companyName: string
  role: string
  inviteUrl: string
  replyTo?: string
}): Promise<SendResult> {
  const resend = getResendClient()
  if (!resend) return { sent: false, reason: 'not_configured' }

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    replyTo: params.replyTo,
    to: params.to,
    subject: `You've been invited to join ${params.companyName} on BusinessOps`,
    html: `
      <p>You've been invited to join <strong>${params.companyName}</strong> on BusinessOps as a ${params.role}.</p>
      <p><a href="${params.inviteUrl}">Accept the invite and set up your account</a></p>
    `,
  })

  if (error) return { sent: false, reason: 'send_failed', message: error.message }
  return { sent: true }
}

export async function sendFeedbackDigestEmail(params: {
  to: string
  date: string
  messageCount: number
  summary: string
  urgentMessages: { reason: string; category: string; message: string; companyName: string }[]
  suggestedActions: { title: string; suggestion: string }[]
}): Promise<SendResult> {
  const resend = getResendClient()
  if (!resend) return { sent: false, reason: 'not_configured' }

  const urgentHtml = params.urgentMessages.length
    ? `
      <h3 style="color:#b91c1c;margin-bottom:4px;">Urgent</h3>
      <ul>
        ${params.urgentMessages
          .map(
            (item) =>
              `<li><strong>${item.companyName}</strong> (${item.category}): ${item.message}<br /><em>Why urgent: ${item.reason}</em></li>`
          )
          .join('')}
      </ul>
    `
    : ''

  const actionsHtml = params.suggestedActions.length
    ? `
      <h3 style="margin-bottom:4px;">Suggested actions</h3>
      <ul>
        ${params.suggestedActions
          .map((action) => `<li><strong>${action.title}</strong> — ${action.suggestion}</li>`)
          .join('')}
      </ul>
    `
    : ''

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: params.to,
    subject: `BusinessOps feedback digest — ${params.date} (${params.messageCount} new)`,
    html: `
      <p>${params.messageCount} new feedback message(s) since the last digest.</p>
      <h3 style="margin-bottom:4px;">Summary</h3>
      <p>${params.summary}</p>
      ${urgentHtml}
      ${actionsHtml}
      <p style="color:#6b7280;font-size:12px;">Full inbox: your BusinessOps admin feedback page.</p>
    `,
  })

  if (error) return { sent: false, reason: 'send_failed', message: error.message }
  return { sent: true }
}

export async function sendInvoiceEmail(params: {
  to: string
  customerName: string
  companyName: string
  jobNumber: string
  total: string
  pdfBuffer: Buffer
  pdfFilename: string
  replyTo?: string
}): Promise<SendResult> {
  const resend = getResendClient()
  if (!resend) return { sent: false, reason: 'not_configured' }

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    replyTo: params.replyTo,
    to: params.to,
    subject: `Invoice from ${params.companyName} — ${params.jobNumber}`,
    html: `
      <p>Hi ${params.customerName},</p>
      <p>Please find attached your invoice from ${params.companyName} for ${params.jobNumber}, total ${params.total}.</p>
    `,
    attachments: [
      {
        filename: params.pdfFilename,
        content: params.pdfBuffer.toString('base64'),
      },
    ],
  })

  if (error) return { sent: false, reason: 'send_failed', message: error.message }
  return { sent: true }
}
