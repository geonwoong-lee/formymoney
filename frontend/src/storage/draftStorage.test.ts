import { beforeEach, describe, expect, it } from 'vitest'
import { clearDraft, DRAFT_STORAGE_KEY, emptyDraft, loadDraft, saveDraft, type VeryRichDraft } from './draftStorage'

describe('draftStorage', () => {
  beforeEach(() => localStorage.clear())

  it('saves and restores a draft in the browser only', () => {
    const draft: VeryRichDraft = {
      ...emptyDraft,
      plan: { monthlyAmount: 500_000 },
      conditions: { payroll: 'unknown' },
    }

    saveDraft(draft)

    expect(loadDraft()).toEqual(draft)
  })

  it('removes invalid or reset data', () => {
    localStorage.setItem(DRAFT_STORAGE_KEY, '{broken')
    expect(loadDraft()).toEqual(emptyDraft)

    saveDraft({ ...emptyDraft, plan: { monthlyAmount: 100_000 } })
    clearDraft()
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull()
  })
})
