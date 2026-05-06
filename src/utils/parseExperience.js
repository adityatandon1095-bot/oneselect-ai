const WRITTEN = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
}

/**
 * Parses experience values from CV text or AI output into a numeric year count.
 * Handles: 1.5, "1.5 years", "3+ years", "~4 years", "3-5 years",
 *          "5 to 8 years", "one year", "two years", etc.
 * Returns null (never throws) for unrecognised input.
 */
export function parseExperience(val) {
  if (val == null) return null
  if (typeof val === 'number') return isFinite(val) ? Math.round(val * 10) / 10 : null

  const s = String(val).toLowerCase().trim()
  if (!s) return null

  // Written numbers: "one year", "two years" …
  for (const [word, num] of Object.entries(WRITTEN)) {
    if (s.startsWith(word)) return num
  }

  // Range: "3-5", "3–5", "5 to 8" — store the minimum
  const range = s.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)/)
  if (range) return parseFloat(range[1])

  // Decimal / approximate / plus: "1.5", "3+", "~4", "4+ years", "c.5"
  const num = s.match(/[~≈c]?\s*(\d+(?:\.\d+)?)\s*\+?/)
  if (num) return parseFloat(num[1])

  return null
}
