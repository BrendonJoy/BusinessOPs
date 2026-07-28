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
}): Promise<SendResult> {
  const resend = getResendClient()
  if (!resend) return { sent: false, reason: 'not_configured' }

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
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
}): Promise<SendResult> {
  const resend = getResendClient()
  if (!resend) return { sent: false, reason: 'not_configured' }

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
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

export async function sendInvoiceEmail(params: {
  to: string
  customerName: string
  companyName: string
  jobNumber: string
  total: string
  pdfBuffer: Buffer
  pdfFilename: string
}): Promise<SendResult> {
  const resend = getResendClient()
  if (!resend) return { sent: false, reason: 'not_configured' }

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
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
