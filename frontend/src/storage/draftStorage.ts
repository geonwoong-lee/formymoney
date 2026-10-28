export const DRAFT_STORAGE_KEY = 'very-rich:draft:v1'

export type ConditionAnswer = 'yes' | 'no' | 'unknown'

export interface VeryRichDraft {
  version: 1
  plan: {
    enrollmentStatus?: string
    monthlyAmount?: number
    startMonth?: string
  }
  conditions: Record<string, ConditionAnswer>
  monthlyPayments: Record<string, number>
}

export const emptyDraft: VeryRichDraft = {
  version: 1,
  plan: {},
  conditions: {},
  monthlyPayments: {},
}

export function loadDraft(storage: Storage = window.localStorage): VeryRichDraft {
  const stored = storage.getItem(DRAFT_STORAGE_KEY)
  if (!stored) return emptyDraft

  try {
    const parsed: unknown = JSON.parse(stored)
    if (!isDraft(parsed)) {
      storage.removeItem(DRAFT_STORAGE_KEY)
      return emptyDraft
    }
    return parsed
  } catch {
    storage.removeItem(DRAFT_STORAGE_KEY)
    return emptyDraft
  }
}

export function saveDraft(draft: VeryRichDraft, storage: Storage = window.localStorage) {
  storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft))
}

export function clearDraft(storage: Storage = window.localStorage) {
  storage.removeItem(DRAFT_STORAGE_KEY)
}

function isDraft(value: unknown): value is VeryRichDraft {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<VeryRichDraft>
  return (
    candidate.version === 1 &&
    typeof candidate.plan === 'object' &&
    candidate.plan !== null &&
    typeof candidate.conditions === 'object' &&
    candidate.conditions !== null &&
    typeof candidate.monthlyPayments === 'object' &&
    candidate.monthlyPayments !== null
  )
}
