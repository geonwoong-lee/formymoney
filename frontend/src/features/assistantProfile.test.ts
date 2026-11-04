import { describe, expect, it } from 'vitest'
import { emptyDraft, type VeryRichDraft } from '../storage/draftStorage'
import { buildAssistantProfile, isAboutMe } from './assistantProfile'

const draft: VeryRichDraft = {
  version: 1,
  plan: { currentBankCode: 'kb', monthlyAmount: 300_000, contributionType: 'general', startMonth: '2026-09', enrollmentStatus: 'enrolled' },
  conditions: { 'kb:salary_transfer': 'yes', 'common:age': 'yes', 'woori:salary_transfer': 'no' },
  monthlyPayments: { '1': 300_000, '2': 0, bad: 5, '3': -10 },
}

describe('assistant profile', () => {
  it('sends nothing before the visitor has typed a bank or an amount', () => {
    expect(buildAssistantProfile(emptyDraft)).toBeUndefined()
  })

  it('keeps the plan, only the answers for the visitor’s bank and common ones, and valid payments', () => {
    const profile = buildAssistantProfile(draft)

    expect(profile).toMatchObject({ bankCode: 'kb', monthlyAmount: 300_000, contributionType: 'general', startMonth: '2026-09', enrollmentStatus: 'enrolled' })
    expect(profile?.conditions).toEqual({ 'kb:salary_transfer': 'yes', 'common:age': 'yes' })  // another bank's answers are not sent
    expect(profile?.payments).toEqual({ '1': 300_000, '2': 0 })  // a malformed key and a negative amount are dropped
  })

  it('treats only questions about the visitor as personal', () => {
    expect(isAboutMe('내 적금 만기금액이 얼마야?')).toBe(true)
    expect(isAboutMe('내 적금 언제 만기야?')).toBe(true)
    expect(isAboutMe('내 조건은 어디에 입력해?')).toBe(false)  // a how-to needs no personal data
    expect(isAboutMe('내 적금 만기 알림은 어떻게 받아?')).toBe(false)
    expect(isAboutMe('이번 달 못 넣으면 어떻게 돼?')).toBe(false)
    expect(isAboutMe('코스피 얼마야?')).toBe(false)
    expect(isAboutMe('청년미래적금 금리가 몇 퍼센트야?')).toBe(false)
  })
})
