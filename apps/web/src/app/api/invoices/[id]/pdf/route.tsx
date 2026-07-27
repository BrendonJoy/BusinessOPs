import { generateInvoicePdf } from '@/lib/invoice-pdf'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await generateInvoicePdf(id)

  if (!result) {
    return new Response(null, { status: 404 })
  }

  return new Response(new Uint8Array(result.buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${result.filename}"`,
    },
  })
}
