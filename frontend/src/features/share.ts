import type { ContributionType } from '../api/client'
import type { ConditionAnswer, VeryRichDraft } from '../storage/draftStorage'

// A shared result carries only the calculation inputs: monthly amount, contribution type, the chosen bank and the
// yes/no answers to bonus-rate conditions. No name, contact or login; whoever opens it recalculates on the server.
export interface SharedPlan {
  monthlyAmount: number
  contributionType: ContributionType
  currentBankCode?: string
  conditions: Record<string, 'yes' | 'no'>
}

const CONTRIBUTION_TYPES: ContributionType[] = ['none', 'general', 'preferred']
const KEY_PATTERN = /^[a-z0-9_-]{1,30}:[a-z0-9_-]{1,60}$/i
const BANK_PATTERN = /^[a-z0-9_-]{1,30}$/i
const MAX_ANSWERS = 200
export const MIN_SHARED_AMOUNT = 1_000  // the savings calculation accepts 1,000 to 500,000 a month
export const MAX_SHARED_AMOUNT = 500_000

export function sharedPlanFromDraft(draft: VeryRichDraft): SharedPlan {
  // "모름" is the default on the other side, so only real answers travel.
  const conditions = Object.fromEntries(Object.entries(draft.conditions)
    .filter((entry): entry is [string, 'yes' | 'no'] => entry[1] === 'yes' || entry[1] === 'no'))
  return {
    monthlyAmount: draft.plan.monthlyAmount ?? 500_000,
    contributionType: draft.plan.contributionType ?? 'general',
    ...(draft.plan.currentBankCode ? { currentBankCode: draft.plan.currentBankCode } : {}),
    conditions,
  }
}

function toBase64Url(text: string) {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string) {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)))
}

export function encodeSharedPlan(plan: SharedPlan): string {
  const answers = Object.entries(plan.conditions).map(([key, answer]) => `${key}=${answer === 'yes' ? 1 : 0}`).join(',')
  return toBase64Url(JSON.stringify({ v: 1, m: plan.monthlyAmount, c: plan.contributionType, b: plan.currentBankCode ?? '', a: answers }))
}

/** The plan in a shared link, or null when the link is broken or edited into something the site would not make. */
export function decodeSharedPlan(value: string | null): SharedPlan | null {
  if (!value || value.length > 6000) return null
  try {
    const data: unknown = JSON.parse(fromBase64Url(value))
    if (!data || typeof data !== 'object') return null
    const { v, m, c, b, a } = data as Record<string, unknown>
    if (v !== 1 || typeof m !== 'number' || !Number.isInteger(m) || m < MIN_SHARED_AMOUNT || m > MAX_SHARED_AMOUNT) return null
    if (!CONTRIBUTION_TYPES.includes(c as ContributionType) || typeof b !== 'string' || typeof a !== 'string') return null
    if (b && !BANK_PATTERN.test(b)) return null
    const pairs = a ? a.split(',') : []
    if (pairs.length > MAX_ANSWERS) return null
    const conditions: Record<string, 'yes' | 'no'> = {}
    for (const pair of pairs) {
      const [key, answer] = pair.split('=')
      if (!KEY_PATTERN.test(key) || (answer !== '1' && answer !== '0')) return null
      conditions[key] = answer === '1' ? 'yes' : 'no'
    }
    return { monthlyAmount: m, contributionType: c as ContributionType, ...(b ? { currentBankCode: b } : {}), conditions }
  } catch {
    return null
  }
}

export function draftFromSharedPlan(plan: SharedPlan, current: VeryRichDraft): VeryRichDraft {
  return {
    ...current,
    plan: {
      ...current.plan, monthlyAmount: plan.monthlyAmount, contributionType: plan.contributionType,
      currentBankCode: plan.currentBankCode,
    },
    conditions: plan.conditions as Record<string, ConditionAnswer>,
  }
}

export function shareUrl(plan: SharedPlan, origin = window.location.origin) {
  return `${origin}/share?d=${encodeSharedPlan(plan)}`
}
