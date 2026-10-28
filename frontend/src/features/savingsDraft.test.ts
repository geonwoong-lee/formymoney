import { describe, expect, it } from 'vitest'
import type { SavingsProduct } from '../api/client'
import { emptyDraft } from '../storage/draftStorage'
import { answersForApi, commonAnswerKey } from './savingsDraft'

describe('answersForApi', () => {
  it('applies one common answer to every bank while keeping bank answers separate', () => {
    const products = ['kb', 'shinhan'].map((bankCode) => ({
      bankCode,
      conditions: [
        { code: 'income_plus' },
        { code: 'card' },
      ],
    })) as SavingsProduct[]
    const draft = {
      ...emptyDraft,
      conditions: {
        [commonAnswerKey('income_plus')]: 'yes' as const,
        'kb:card': 'no' as const,
      },
    }

    expect(answersForApi(draft, products)).toEqual({
      kb: { income_plus: 'yes', card: 'no' },
      shinhan: { income_plus: 'yes', card: 'unknown' },
    })
  })
})
