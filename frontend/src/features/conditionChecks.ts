// "Did I meet this bonus-rate condition this month?" The answers live only in this browser, month by month.
export type CheckAnswer = 'done' | 'missed'  // no entry means "not yet"

export type MonthChecks = Record<string, CheckAnswer>
export type AllChecks = Record<string, MonthChecks>

export const CHECKS_KEY = 'very-rich:condition-checks:v1'
const KEEP_MONTHS = 36
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

export function loadChecks(): AllChecks {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(CHECKS_KEY) ?? '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    const checks: AllChecks = {}
    for (const [month, answers] of Object.entries(value as Record<string, unknown>)) {
      if (!MONTH.test(month) || !answers || typeof answers !== 'object') continue
      const clean: MonthChecks = {}
      for (const [code, answer] of Object.entries(answers as Record<string, unknown>)) {
        if (answer === 'done' || answer === 'missed') clean[code] = answer
      }
      checks[month] = clean
    }
    return checks
  } catch {
    return {}
  }
}

function save(checks: AllChecks) {
  try {
    window.localStorage.setItem(CHECKS_KEY, JSON.stringify(checks))
  } catch {
    // Storage blocked: the answers only last for this visit.
  }
}

/** Sets (or, with null, clears) one condition's answer for a month and returns the new answers. */
export function setCheck(checks: AllChecks, month: string, code: string, answer: CheckAnswer | null): AllChecks {
  const forMonth = { ...checks[month] }
  if (answer === null) delete forMonth[code]
  else forMonth[code] = answer
  const next = { ...checks, [month]: forMonth }
  const months = Object.keys(next).sort()
  for (const old of months.slice(0, Math.max(0, months.length - KEEP_MONTHS))) delete next[old]
  save(next)
  return next
}

export function currentMonth(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/** How a month went for the conditions that count: met, missed and still open. Codes not counted are ignored. */
export function summarizeMonth(checks: AllChecks, month: string, codes: string[]) {
  const answers = checks[month] ?? {}
  const done = codes.filter((code) => answers[code] === 'done').length
  const missed = codes.filter((code) => answers[code] === 'missed').length
  return { done, missed, open: codes.length - done - missed, total: codes.length }
}

/** The months before `month` that have any answer for these conditions, newest first, at most `limit`. */
export function pastMonths(checks: AllChecks, month: string, codes: string[], limit = 6) {
  return Object.keys(checks)
    .filter((key) => key < month && codes.some((code) => checks[key][code]))
    .sort()
    .reverse()
    .slice(0, limit)
    .map((key) => ({ month: key, ...summarizeMonth(checks, key, codes) }))
}
