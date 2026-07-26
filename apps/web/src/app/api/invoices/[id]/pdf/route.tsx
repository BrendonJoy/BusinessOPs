import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/money'
import type { Invoice, InvoiceLineItem } from '@trade-assist/db'

type InvoicePdfData = Invoice & {
  invoice_line_items: InvoiceLineItem[]
  jobs: {
    job_number: string | null
    address_line: string | null
    company_id: string
    customers: { name: string; email: string | null; phone: string | null; address: string | null } | null
  }
}

type PdfCompany = {
  name: string
  gst_number: string | null
  address: string | null
  logo_url: string | null
  currency: string
  tax_label: string
}

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: 'Helvetica', color: '#111111' },
  logo: { width: 64, height: 64, marginBottom: 8, objectFit: 'contain' },
  companyName: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  muted: { color: '#6b7280' },
  section: { marginBottom: 16 },
  heading: { fontSize: 14, fontWeight: 'bold', marginBottom: 8 },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#111111',
    paddingBottom: 4,
    marginBottom: 4,
    fontWeight: 'bold',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e4e4e7',
    paddingVertical: 4,
  },
  colDescription: { flex: 3 },
  colQty: { flex: 1, textAlign: 'right' },
  colPrice: { flex: 1, textAlign: 'right' },
  colTotal: { flex: 1, textAlign: 'right' },
  totalRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 },
  totalLabel: { fontWeight: 'bold', marginRight: 12 },
  totalValue: { fontWeight: 'bold' },
})

function InvoiceDocument({
  company,
  invoice,
}: {
  company: PdfCompany
  invoice: InvoicePdfData
}) {
  const customer = invoice.jobs.customers

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.section}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image, not an HTML img */}
          {company.logo_url && <Image src={company.logo_url} style={styles.logo} />}
          <Text style={styles.companyName}>{company.name}</Text>
          {company.address && <Text style={styles.muted}>{company.address}</Text>}
          {company.gst_number && <Text style={styles.muted}>GST/Tax number: {company.gst_number}</Text>}
          <Text style={styles.muted}>Invoice for {invoice.jobs.job_number ?? 'job'}</Text>
        </View>

        <View style={styles.section}>
          <Text>{customer?.name ?? 'Customer'}</Text>
          {customer?.email && <Text style={styles.muted}>{customer.email}</Text>}
          {customer?.phone && <Text style={styles.muted}>{customer.phone}</Text>}
          {invoice.jobs.address_line && <Text style={styles.muted}>{invoice.jobs.address_line}</Text>}
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>Invoice</Text>
          <Text style={styles.muted}>Status: {invoice.status}</Text>
          <Text style={styles.muted}>Date: {new Date(invoice.created_at).toLocaleDateString()}</Text>
        </View>

        <View>
          <View style={styles.tableHeader}>
            <Text style={styles.colDescription}>Description</Text>
            <Text style={styles.colQty}>Qty</Text>
            <Text style={styles.colPrice}>Unit price</Text>
            <Text style={styles.colTotal}>Total</Text>
          </View>
          {invoice.invoice_line_items.map((item) => (
            <View key={item.id} style={styles.tableRow}>
              <Text style={styles.colDescription}>{item.description}</Text>
              <Text style={styles.colQty}>{item.quantity}</Text>
              <Text style={styles.colPrice}>{formatMoney(Number(item.unit_price), company.currency)}</Text>
              <Text style={styles.colTotal}>{formatMoney(Number(item.line_total), company.currency)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Subtotal</Text>
          <Text style={styles.totalValue}>{formatMoney(Number(invoice.total), company.currency)}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>
            {company.tax_label} ({Number(invoice.tax_rate)}%)
          </Text>
          <Text style={styles.totalValue}>{formatMoney(Number(invoice.tax_amount), company.currency)}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>
            {formatMoney(Number(invoice.total) + Number(invoice.tax_amount), company.currency)}
          </Text>
        </View>
      </Page>
    </Document>
  )
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data } = await supabase
    .from('invoices')
    .select('*, invoice_line_items(*), jobs(job_number, address_line, company_id, customers(name, email, phone, address))')
    .eq('id', id)
    .maybeSingle()

  const invoice = data as unknown as InvoicePdfData | null

  if (!invoice) {
    return new Response(null, { status: 404 })
  }

  const { data: company } = await supabase
    .from('companies')
    .select('name, gst_number, address, logo_url, currency, tax_label')
    .eq('id', invoice.jobs.company_id)
    .maybeSingle()

  const pdfCompany: PdfCompany = {
    name: company?.name ?? 'Trade Assist',
    gst_number: company?.gst_number ?? null,
    address: company?.address ?? null,
    logo_url: company?.logo_url ?? null,
    currency: company?.currency ?? 'USD',
    tax_label: company?.tax_label ?? 'Tax',
  }

  const buffer = await renderToBuffer(<InvoiceDocument company={pdfCompany} invoice={invoice} />)

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${invoice.jobs.job_number ?? 'invoice'}.pdf"`,
    },
  })
}
