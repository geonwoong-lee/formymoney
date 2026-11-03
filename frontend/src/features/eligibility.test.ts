import { describe, expect, it } from 'vitest'
import { ageOn, judgeYouthEligibility, verdictToAnswer, type EligibilityInput } from './eligibility'

const TODAY = new Date(2026, 10, 3)  // 2026-11-03
const base: EligibilityInput = {
  birthDate: '1999-05-20', militaryMonths: 0, kind: 'worker', amount: 3000, smallCompany: true, householdSize: 1, couple: false, householdIncome: 3000,
}

describe('ageOn', () => {
  it('counts completed years and leaves out military service', () => {
    expect(ageOn('1999-05-20', TODAY)).toBe(27)
    expect(ageOn('1999-11-04', TODAY)).toBe(26)  // birthday is tomorrow
    expect(ageOn('1999-11-03', TODAY)).toBe(27)  // birthday is today
    expect(ageOn('1991-05-20', TODAY, 24)).toBe(33)  // 35 minus two years of service
    expect(ageOn('1991-05-20', TODAY, 999)).toBe(29)  // service counts for at most six years
    expect(ageOn('not a date', TODAY)).toBeNull()
  })
})

describe('judgeYouthEligibility', () => {
  it('says preferred for a small-company worker under the preferred limits', () => {
    const result = judgeYouthEligibility(base, TODAY)
    expect(result?.verdict).toBe('preferred')
    expect(result?.householdChecked).toBe(true)
  })

  it('stops at the age rule on both sides, with service time left out', () => {
    expect(judgeYouthEligibility({ ...base, birthDate: '2009-01-01' }, TODAY)?.verdict).toBe('not_eligible')
    expect(judgeYouthEligibility({ ...base, birthDate: '1991-05-20' }, TODAY)?.verdict).toBe('not_eligible')  // 35
    expect(judgeYouthEligibility({ ...base, birthDate: '1991-05-20', militaryMonths: 24 }, TODAY)?.verdict).toBe('preferred')
    expect(judgeYouthEligibility({ ...base, birthDate: '1991-11-03' }, TODAY)?.lines.at(-1)).toContain('만 35세')
    expect(judgeYouthEligibility({ ...base, birthDate: '' }, TODAY)).toBeNull()
  })

  it('walks down the salary limits', () => {
    expect(judgeYouthEligibility({ ...base, amount: 3600 }, TODAY)?.verdict).toBe('preferred')
    expect(judgeYouthEligibility({ ...base, amount: 3601 }, TODAY)?.verdict).toBe('general')
    expect(judgeYouthEligibility({ ...base, amount: 3000, smallCompany: false }, TODAY)?.verdict).toBe('general')
    expect(judgeYouthEligibility({ ...base, amount: 6000, householdIncome: 6000 }, TODAY)?.verdict).toBe('general')
    expect(judgeYouthEligibility({ ...base, amount: 6001, householdIncome: 6000 }, TODAY)?.verdict).toBe('tax_only')
    expect(judgeYouthEligibility({ ...base, amount: 7500, householdIncome: 6000 }, TODAY)?.verdict).toBe('tax_only')
    expect(judgeYouthEligibility({ ...base, amount: 7501, householdIncome: 7501 }, TODAY)?.verdict).toBe('not_eligible')
  })

  it('uses the sales limits for a small business', () => {
    const business = { ...base, kind: 'business' as const, smallCompany: false }
    expect(judgeYouthEligibility({ ...business, amount: 10000 }, TODAY)?.verdict).toBe('preferred')
    expect(judgeYouthEligibility({ ...business, amount: 10001 }, TODAY)?.verdict).toBe('general')
    expect(judgeYouthEligibility({ ...business, amount: 30000, householdIncome: 3000 }, TODAY)?.verdict).toBe('general')
    expect(judgeYouthEligibility({ ...business, amount: 30001 }, TODAY)?.verdict).toBe('not_eligible')
  })

  it('compares the household with the 2026 median income times the allowed share', () => {
    // One person: 2,564,238 × 12 = 30,770,856원/yr; 150% = 4,615만원, 200% = 6,154만원.
    expect(judgeYouthEligibility({ ...base, householdIncome: 4615 }, TODAY)?.verdict).toBe('preferred')
    expect(judgeYouthEligibility({ ...base, householdIncome: 4616 }, TODAY)?.verdict).toBe('general')
    expect(judgeYouthEligibility({ ...base, householdIncome: 6154 }, TODAY)?.verdict).toBe('general')
    expect(judgeYouthEligibility({ ...base, householdIncome: 6155 }, TODAY)?.verdict).toBe('not_eligible')
  })

  it('widens the share for a two-person couple household', () => {
    // Two persons: 4,199,292 × 12 = 5,039만원/yr; 200% = 10,078만원, 250% = 12,597만원.
    const two = { ...base, householdSize: 2, amount: 3000 }
    expect(judgeYouthEligibility({ ...two, householdIncome: 12000 }, TODAY)?.verdict).toBe('not_eligible')
    expect(judgeYouthEligibility({ ...two, couple: true, householdIncome: 12000 }, TODAY)?.verdict).toBe('general')
    expect(judgeYouthEligibility({ ...two, couple: true, householdIncome: 10000 }, TODAY)?.verdict).toBe('preferred')
    // The couple box means nothing for other household sizes.
    expect(judgeYouthEligibility({ ...base, couple: true, householdIncome: 6155 }, TODAY)?.verdict).toBe('not_eligible')
  })

  it('leaves the household to the bank for five or more people', () => {
    const result = judgeYouthEligibility({ ...base, householdSize: 5, householdIncome: 99999 }, TODAY)
    expect(result?.householdChecked).toBe(false)
    expect(result?.verdict).toBe('general')
    expect(result?.lines.join(' ')).toContain('5명 이상')
  })

  it('maps the verdict onto the visitor’s answer', () => {
    expect(verdictToAnswer('preferred')).toBe('eligible')
    expect(verdictToAnswer('general')).toBe('eligible')
    expect(verdictToAnswer('tax_only')).toBe('eligible')
    expect(verdictToAnswer('not_eligible')).toBe('not_eligible')
  })
})
