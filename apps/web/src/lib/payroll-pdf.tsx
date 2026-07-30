import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/money'
import { getCompanyCurrency, getCompanyInfo } from '@/lib/company'
import { getPayrollReport, type StaffPayroll } from '@/lib/payroll'

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: 'Helvetica', color: '#111111' },
  companyName: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  muted: { color: '#6b7280' },
  section: { marginBottom: 16 },
  heading: { fontSize: 14, fontWeight: 'bold', marginBottom: 8 },
  staffHeading: { fontSize: 12, fontWeight: 'bold', marginTop: 12, marginBottom: 4 },
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
  totalRow: { flexDirection: 'row', paddingVertical: 4, fontWeight: 'bold' },
  colDate: { flex: 2 },
  colTarget: { flex: 2 },
  colTimes: { flex: 2 },
  colStatus: { flex: 2 },
  colHours: { flex: 1, textAlign: 'right' },
  colPay: { flex: 1.5, textAlign: 'right' },
  grandTotal: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 },
  grandLabel: { fontWeight: 'bold', marginRight: 12 },
  grandValue: { fontWeight: 'bold' },
})

function formatDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function PayrollDocument({
  companyName,
  currency,
  from,
  to,
  staffRows,
}: {
  companyName: string
  currency: string
  from: string
  to: string
  staffRows: StaffPayroll[]
}) {
  const grandHours = staffRows.reduce((sum, s) => sum + s.totalHours, 0)
  const grandPay = staffRows.reduce((sum, s) => sum + (s.totalPay ?? 0), 0)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.section}>
          <Text style={styles.companyName}>{companyName}</Text>
          <Text style={styles.heading}>Payroll report</Text>
          <Text style={styles.muted}>
            Period: {formatDate(from)} – {formatDate(to)}
          </Text>
        </View>

        {staffRows.map((staff) => (
          <View key={staff.profileId} style={styles.section} wrap={false}>
            <Text style={styles.staffHeading}>
              {staff.staffName}
              {staff.rate !== null ? `  ·  ${formatMoney(staff.rate, currency)}/hr` : ''}
            </Text>
            <View style={styles.tableHeader}>
              <Text style={styles.colDate}>Date</Text>
              <Text style={styles.colTarget}>Job / category</Text>
              <Text style={styles.colTimes}>Times</Text>
              <Text style={styles.colStatus}>Status</Text>
              <Text style={styles.colHours}>Hours</Text>
              <Text style={styles.colPay}>Pay</Text>
            </View>
            {staff.entries.map((entry) => (
              <View key={entry.id} style={styles.tableRow}>
                <Text style={styles.colDate}>{formatDate(entry.workDate)}</Text>
                <Text style={styles.colTarget}>{entry.target}</Text>
                <Text style={styles.colTimes}>
                  {formatTime(entry.clockIn)}
                  {entry.clockOut ? `–${formatTime(entry.clockOut)}` : ' (open)'}
                </Text>
                <Text style={styles.colStatus}>
                  {entry.dayStatus === 'approved' ? 'Approved' : entry.dayStatus === 'submitted' ? 'Awaiting approval' : 'Not submitted'}
                </Text>
                <Text style={styles.colHours}>{entry.hours.toFixed(2)}</Text>
                <Text style={styles.colPay}>
                  {staff.rate !== null ? formatMoney(entry.hours * staff.rate, currency) : '—'}
                </Text>
              </View>
            ))}
            <View style={styles.totalRow}>
              <Text style={styles.colDate}>Total</Text>
              <Text style={styles.colTarget} />
              <Text style={styles.colTimes} />
              <Text style={styles.colStatus} />
              <Text style={styles.colHours}>{staff.totalHours.toFixed(2)}</Text>
              <Text style={styles.colPay}>
                {staff.totalPay !== null ? formatMoney(staff.totalPay, currency) : '—'}
              </Text>
            </View>
          </View>
        ))}

        <View style={styles.grandTotal}>
          <Text style={styles.grandLabel}>Total ({grandHours.toFixed(2)} hours)</Text>
          <Text style={styles.grandValue}>{formatMoney(grandPay, currency)}</Text>
        </View>
      </Page>
    </Document>
  )
}

export async function generatePayrollPdf(
  from: string,
  to: string
): Promise<{ buffer: Buffer; filename: string } | null> {
  const supabase = await createClient()

  const [staffRows, info, { currency }] = await Promise.all([
    getPayrollReport(supabase, from, to),
    getCompanyInfo(supabase),
    getCompanyCurrency(supabase),
  ])

  const buffer = await renderToBuffer(
    <PayrollDocument
      companyName={info?.name || 'BusinessOps'}
      currency={currency}
      from={from}
      to={to}
      staffRows={staffRows}
    />
  )

  return { buffer, filename: `payroll-${from}-to-${to}.pdf` }
}
