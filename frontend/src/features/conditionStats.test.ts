import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SavingsProduct } from '../api/client'
import { emptyDraft } from '../storage/draftStorage'
import { ANALYTICS_CONSENT_KEY } from './analytics'
import { CONDITION_ANSWERS_SENT_KEY, explicitAnswers, sendConditionAnswers } from './conditionStats'
import { answerKey, commonAnswerKey } from './savingsDraft'

const condition = (code: string) => ({ code, title: code, bonusRate: 0.5, description: '', question: '', requiresAdditionalReview: false })
const products = [
  { bankCode: 'kb', bankName: 'KB', productName: 'KB', baseRate: 5, maximumRate: 8, sourceUrl: '', sourceDate: '', conditions: [condition('salary'), condition('income_plus'), condition('card')] },
  { bankCode: 'nh', bankName: 'NH', productName: 'NH', baseRate: 5, maximumRate: 8, sourceUrl: '', sourceDate: '', conditions: [condition('income_plus')] },
] as unknown as SavingsProduct[]
const draft = {
  ...emptyDraft,
  conditions: { [answerKey('kb', 'salary')]: 'no' as const, [commonAnswerKey('income_plus')]: 'yes' as const },
}

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  localStorage.clear()
  fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('condition answer statistics', () => {
  it('keeps only answers the visitor gave, including shared ones, and never fills in "unknown"', () => {
    expect(explicitAnswers(draft, products)).toEqual({ kb: { salary: 'no', income_plus: 'yes' }, nh: { income_plus: 'yes' } })
    expect(explicitAnswers(emptyDraft, products)).toEqual({})
  })

  it('sends nothing without consent or without answers', () => {
    sendConditionAnswers(draft, products)
    localStorage.setItem(ANALYTICS_CONSENT_KEY, 'no')
    sendConditionAnswers(draft, products)
    localStorage.setItem(ANALYTICS_CONSENT_KEY, 'yes')
    sendConditionAnswers(emptyDraft, products)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends only the answers, once a day from this browser', () => {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, 'yes')
    sendConditionAnswers(draft, products, new Date(2026, 10, 5, 9))
    sendConditionAnswers(draft, products, new Date(2026, 10, 5, 22))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/api\/v1\/analytics\/condition-answers$/)
    expect(JSON.parse(String(init.body))).toEqual({ answers: { kb: { salary: 'no', income_plus: 'yes' }, nh: { income_plus: 'yes' } } })
    expect(localStorage.getItem(CONDITION_ANSWERS_SENT_KEY)).toBe('2026-11-05')

    sendConditionAnswers(draft, products, new Date(2026, 10, 6, 9))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
