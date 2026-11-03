import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { BankCalculationResult, ConditionResult } from '../api/client'
import { RateExplain } from './RateExplain'

afterEach(cleanup)

const condition = (code: string, title: string, status: string, bonusRate: number, appliedBonusRate = 0): ConditionResult =>
  ({ code, title, bonusRate, answer: 'yes', status, appliedBonusRate, reason: '' })
const bank = (conditions: ConditionResult[], expectedRate: number): BankCalculationResult => ({
  bankCode: 'kb', bankName: 'KB국민은행', productName: '청년미래적금', baseRate: 3.5, maximumRate: 5.5, appliedBonusRate: 0, expectedRate,
  principal: 0, depositInterest: 0, governmentContribution: 0, governmentContributionInterest: 0, expectedMaturityAmount: 0,
  differenceFromCurrentBank: null, conditions, sourceUrl: '', sourceDate: '',
})

describe('RateExplain', () => {
  it('lays the expected rate out as the base rate plus each counted bonus and names what was left out', () => {
    render(<RateExplain bank={bank([
      condition('a', '급여 이체', 'applied', 0.8, 0.8), condition('b', '카드 사용', 'not_applied', 0.5),
      condition('c', '앱 로그인', 'needs_review', 0.4),
    ], 4.3)} />)

    const text = document.body.textContent ?? ''
    expect(text).toContain('기본금리 3.5%')
    expect(text).toContain('+ 0.8%p 급여 이체')
    expect(text).toContain('예상금리 4.3%')
    expect(text).not.toContain('최고금리를 넘지 않게')
    expect(screen.getByText(/못 채운다고 답한 조건 1개는 더하지 않았어요: 카드 사용\(\+0.5%p\)/)).toBeInTheDocument()
    expect(screen.getByText(/모르거나 확인이 필요한 조건 1개도 더하지 않았어요: 앱 로그인\(\+0.4%p\)\. 다 채우면 최대 5.5%예요/)).toBeInTheDocument()
  })

  it('says when the sum was held down to the top rate and stays quiet when nothing was left out', () => {
    render(<RateExplain bank={bank([condition('a', '급여 이체', 'applied', 3, 3)], 5.5)} />)
    expect(document.body.textContent).toContain('최고금리를 넘지 않게 맞췄어요')
    expect(document.body.textContent).not.toContain('더하지 않았어요')
  })
})
