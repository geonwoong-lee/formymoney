import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CHECKS_KEY, loadChecks, pastMonths, setCheck, summarizeMonth } from '../features/conditionChecks'
import { MonthlyConditionCheck } from './MonthlyConditionCheck'

const condition = (code: string, title: string, rate: number) => ({
  code, title, answer: 'yes', status: 'applied', bonusRate: rate, appliedBonusRate: rate, reason: '',
}) as never

const NOV = new Date(2026, 10, 15)
const applied = [condition('salary', '급여 이체', 0.5), condition('card', '카드 실적', 0.3)]
const impacts = [{ code: 'salary', maturityAmount: 19_500_000, loss: 250_750 }, { code: 'card', maturityAmount: 19_600_000, loss: 150_750 }]

beforeEach(() => window.localStorage.clear())
afterEach(() => cleanup())

describe('MonthlyConditionCheck', () => {
  it('records this month, prices a missed condition and remembers it after a reload', async () => {
    const user = userEvent.setup()
    render(<MonthlyConditionCheck applied={applied} impacts={impacts} today={NOV} />)
    expect(screen.getByRole('heading', { name: '2026년 11월 우대조건 체크' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('2개 중 0개 채웠어요, 2개는 아직이에요')

    const salary = screen.getByRole('group', { name: /급여 이체/ })
    await user.click(within(salary).getByRole('radio', { name: '채웠어요' }))
    const card = screen.getByRole('group', { name: /카드 실적/ })
    await user.click(within(card).getByRole('radio', { name: '못 채웠어요' }))

    expect(screen.getByRole('status')).toHaveTextContent('2개 중 1개 채웠어요, 1개는 못 채웠어요')
    expect(card).toHaveTextContent('끝까지 못 채우면 예상금리가 0.3%p 낮아지고 만기금액이 150,750원 줄어 19,600,000원이 돼요')
    expect(salary).not.toHaveTextContent('줄어')
    expect(JSON.parse(window.localStorage.getItem(CHECKS_KEY) ?? '{}')).toEqual({ '2026-11': { salary: 'done', card: 'missed' } })

    cleanup()
    render(<MonthlyConditionCheck applied={applied} impacts={impacts} today={NOV} />)
    expect(within(screen.getByRole('group', { name: /급여 이체/ })).getByRole('radio', { name: '채웠어요' })).toBeChecked()
    await user.click(within(screen.getByRole('group', { name: /급여 이체/ })).getByRole('radio', { name: '아직이에요' }))
    expect(JSON.parse(window.localStorage.getItem(CHECKS_KEY) ?? '{}')['2026-11']).toEqual({ card: 'missed' })
  })

  it('shows earlier months of the same conditions', () => {
    window.localStorage.setItem(CHECKS_KEY, JSON.stringify({
      '2026-09': { salary: 'done', card: 'done' }, '2026-10': { salary: 'done', card: 'missed' }, '2026-08': { other: 'done' },
    }))
    render(<MonthlyConditionCheck applied={applied} impacts={impacts} today={NOV} />)
    expect(document.body).toHaveTextContent('지난 기록: 10월 1/2 · 9월 2/2')
  })
})

describe('condition checks storage', () => {
  it('ignores broken data, keeps three years and counts only the conditions that count', () => {
    window.localStorage.setItem(CHECKS_KEY, '{broken')
    expect(loadChecks()).toEqual({})
    window.localStorage.setItem(CHECKS_KEY, JSON.stringify({ 'not-a-month': { a: 'done' }, '2026-01': { a: 'maybe', b: 'done' } }))
    expect(loadChecks()).toEqual({ '2026-01': { b: 'done' } })

    let checks = {}
    for (let index = 0; index < 40; index++) checks = setCheck(checks, `${2023 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`, 'a', 'done')
    expect(Object.keys(checks)).toHaveLength(36)
    expect(summarizeMonth({ '2026-11': { a: 'done', b: 'missed', z: 'done' } }, '2026-11', ['a', 'b', 'c'])).toEqual({ done: 1, missed: 1, open: 1, total: 3 })
    expect(pastMonths({ '2026-10': { a: 'done' }, '2026-12': { a: 'done' } }, '2026-11', ['a']).map((item) => item.month)).toEqual(['2026-10'])
  })
})
