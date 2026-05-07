export const CURRENCIES = [
  { code: 'INR', symbol: '₹',   name: 'Indian Rupee',      unit: 'L',  unitLabel: 'LPA',  perLabel: 'per annum' },
  { code: 'USD', symbol: '$',   name: 'US Dollar',          unit: 'k',  unitLabel: 'K',    perLabel: 'per year'  },
  { code: 'GBP', symbol: '£',   name: 'British Pound',      unit: 'k',  unitLabel: 'K',    perLabel: 'per year'  },
  { code: 'EUR', symbol: '€',   name: 'Euro',               unit: 'k',  unitLabel: 'K',    perLabel: 'per year'  },
  { code: 'SGD', symbol: 'S$',  name: 'Singapore Dollar',   unit: 'k',  unitLabel: 'K',    perLabel: 'per year'  },
  { code: 'AED', symbol: 'AED ', name: 'UAE Dirham',         unit: 'k',  unitLabel: 'K',    perLabel: 'per year'  },
]

export const DEFAULT_CURRENCY = 'INR'

export function getCurrency(code) {
  return CURRENCIES.find(c => c.code === code) ?? CURRENCIES[0]
}

export function fmtSalary(min, max, currencyCode = DEFAULT_CURRENCY) {
  if (min == null && max == null) return null
  const c = getCurrency(currencyCode)
  const fmt = v => `${c.symbol}${v}${c.unit}`
  if (min != null && max != null) return `${fmt(min)} – ${fmt(max)}`
  if (min != null) return `${fmt(min)}+`
  return `Up to ${fmt(max)}`
}

export function fmtPrice(amount, currencyCode = DEFAULT_CURRENCY) {
  if (amount == null) return null
  const c = getCurrency(currencyCode)
  return `${c.symbol}${Number(amount).toLocaleString('en-IN')}`
}
