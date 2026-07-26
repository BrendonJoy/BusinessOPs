const CURRENCY_LOCALE: Record<string, string> = {
  USD: 'en-US',
  AUD: 'en-AU',
  NZD: 'en-NZ',
  GBP: 'en-GB',
  EUR: 'en-IE',
  CAD: 'en-CA',
}

export function formatMoney(amount: number, currency: string): string {
  const locale = CURRENCY_LOCALE[currency] ?? 'en-US'
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount)
}
