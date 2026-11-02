// Savings interest the way the rest of the site counts it: each month's deposit earns the yearly rate
// for the months left until maturity (simple interest), so total = monthly × rate × n(n+1)/2 / 12.
export const INTEREST_TAX = 0.154
export const MONTH_OPTIONS = [6, 12, 24, 36] as const
export const STEP_OPTIONS = [0.25, 0.5, 1] as const
export const MIN_MONTHLY = 10_000
export const MAX_MONTHLY = 10_000_000

export interface ScenarioResult {
  rate: number
  principal: number
  interest: number
  tax: number
  afterTax: number
}

export function savingsAtMaturity(monthly: number, months: number, ratePercent: number): ScenarioResult {
  const rate = Math.max(0, ratePercent)
  const principal = monthly * months
  const interest = Math.round(monthly * (rate / 100) * (months * (months + 1)) / 2 / 12)
  const tax = Math.floor(interest * INTEREST_TAX)
  return { rate, principal, interest, tax, afterTax: principal + interest - tax }
}
