import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyDraft, saveDraft } from '../storage/draftStorage'
import { MySavingsPage } from './MySavingsPage'

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const condition = (code: string, title: string, status: string, applied = 0) => ({
  code, title, answer: status === 'applied' ? 'yes' : status === 'not_applied' ? 'no' : 'unknown', status, bonusRate: 0.5, appliedBonusRate: applied, reason: '',
})

const products = {
  policy: { termMonths: 36, minimumMonthlyAmount: 1_000, maximumMonthlyAmount: 500_000, generalContributionRate: 6, preferredContributionRate: 12, taxExempt: true },
  products: [{ bankCode: 'kb', bankName: 'KB국민은행', conditions: [{ code: 'salary' }, { code: 'card' }, { code: 'app' }] }],
}

function status(overrides: Record<string, unknown> = {}) {
  return {
    timeline: { phase: 'saving', startMonth: '2026-01', maturityMonth: '2029-01', currentRound: 11, termMonths: 36, monthsToMaturity: 26 },
    payments: { paidRounds: 10, paidAmount: 4_750_000, remainingRounds: 25, remainingAmount: 12_500_000, skippedRounds: [2], reducedRounds: [3] },
    cashflow: {
      bankCode: 'kb', termMonths: 36, monthlyAmounts: [], fixedExpectedMaturityAmount: 20_550_750, differenceFromFixedPlan: -800_000,
      result: {
        bankCode: 'kb', bankName: 'KB국민은행', productName: 'KB 청년미래적금', baseRate: 4.5, maximumRate: 6, appliedBonusRate: 0.5, expectedRate: 5,
        principal: 17_250_000, depositInterest: 1_300_000, governmentContribution: 1_035_000, governmentContributionInterest: 60_000,
        expectedMaturityAmount: 19_750_750, differenceFromCurrentBank: null, conditions: [], sourceUrl: 'https://x', sourceDate: '2026-10-01',
      },
    },
    conditions: {
      applied: [condition('salary', '급여 이체', 'applied', 0.5)], notApplied: [condition('card', '카드 실적', 'not_applied')],
      needsCheck: [condition('app', '앱 가입', 'needs_review')], ifCheckedMaturityAmount: 19_900_000, ifCheckedGain: 149_250,
    },
    ...overrides,
  }
}

function stub(body = status()) {
  const fetch = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input)
    if (url.includes('/savings/products')) return Promise.resolve(respond(products))
    if (url.includes('/my-status')) return Promise.resolve(respond(body))
    if (url.includes('/events')) return Promise.resolve(respond({ today: '2026-11-03', items: [
      { key: 'fomc', date: '2026-11-05', dDay: 2, kind: 'rate', title: '미국 FOMC 금리 결정', why: '', sourceName: '', sourceUrl: '', checkedOn: '', tentative: false },
    ] }))
    return Promise.resolve(respond({}))
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

const renderPage = () => render(<MemoryRouter><MySavingsPage /></MemoryRouter>)

beforeEach(() => window.localStorage.clear())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('MySavingsPage', () => {
  it('asks for a bank first and calls nothing heavy without one', async () => {
    const fetch = stub()
    renderPage()
    expect(screen.getByText(/아직 어느 은행 적금인지 정하지 않았어요/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '내 조건 입력하기' })).toHaveAttribute('href', '/conditions')
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(fetch.mock.calls.some(([input]) => String(input).includes('/my-status'))).toBe(false)
  })

  it('sends the inputs on this device and shows the round, payments, conditions and events', async () => {
    saveDraft({
      ...emptyDraft,
      plan: { currentBankCode: 'kb', monthlyAmount: 500_000, contributionType: 'general', startMonth: '2026-01', enrollmentStatus: 'enrolled' },
      conditions: { 'kb:salary': 'yes', 'common:card': 'no' }, monthlyPayments: { '2': 0, '3': 250_000 },
    })
    const fetch = stub()
    renderPage()

    const progress = await screen.findByRole('progressbar', { name: '납입 진행' })
    expect(progress.previousElementSibling).toHaveTextContent('36회 중 11회차를 넣는 달이에요')
    const sent = JSON.parse(String(fetch.mock.calls.find(([input]) => String(input).includes('/my-status'))?.[1]?.body))
    expect(sent.monthlyAmounts).toHaveLength(36)
    expect(sent.monthlyAmounts.slice(0, 4)).toEqual([500_000, 0, 250_000, 500_000])
    expect(sent).toMatchObject({ bankCode: 'kb', fixedMonthlyAmount: 500_000, startMonth: '2026-01', enrolled: true,
      conditionAnswers: { salary: 'yes', card: 'no', app: 'unknown' } })

    expect(screen.getByRole('progressbar', { name: '납입 진행' })).toHaveAttribute('aria-valuenow', '11')
    expect(screen.getByText('19,750,750원')).toBeInTheDocument()
    expect(screen.getByText(/매달 똑같이 넣었을 때보다 800,000원 적어요/)).toBeInTheDocument()
    const payments = screen.getByRole('region', { name: '납입 현황' })
    expect(payments).toHaveTextContent('이번 달까지 넣은 돈4,750,000원 (10회)')
    expect(payments).toHaveTextContent('건너뛴 회차: 2회차')
    expect(payments).toHaveTextContent('줄여서 넣은 회차: 3회차')
    const conditions = screen.getByRole('region', { name: '우대조건' })
    expect(conditions).toHaveTextContent('최대 149,250원 늘어 19,900,000원이 돼요')
    expect(within(conditions).getByText('반영된 조건 1개')).toBeInTheDocument()
    expect(conditions).toHaveTextContent('카드 실적')
    expect(screen.getByRole('region', { name: '다가올 일정' })).toHaveTextContent('D-2 11월 5일 미국 FOMC 금리 결정')
  })

  it('explains the other phases', async () => {
    saveDraft({ ...emptyDraft, plan: { currentBankCode: 'kb', monthlyAmount: 500_000 } })
    stub(status({ timeline: { phase: 'unknown', startMonth: null, maturityMonth: null, currentRound: null, termMonths: 36, monthsToMaturity: null } }))
    renderPage()
    expect(await screen.findByText(/가입한 달을 넣으면 지금 몇 회차인지/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '납입 현황' })).toHaveTextContent('납입을 시작하면')

    cleanup()
    stub(status({ timeline: { phase: 'matured', startMonth: '2023-01', maturityMonth: '2026-01', currentRound: null, termMonths: 36, monthsToMaturity: 0 } }))
    renderPage()
    expect(await screen.findByText(/만기\(2026년 1월\)가 지났어요/)).toBeInTheDocument()
  })

  it('can switch to a saved plan when signed in', async () => {
    const user = userEvent.setup()
    saveDraft({ ...emptyDraft, plan: { currentBankCode: 'kb', monthlyAmount: 500_000 } })
    window.localStorage.setItem('very-rich:auth:v1', JSON.stringify({ accessToken: 'token', refreshToken: null, expiresAt: null }))
    const fetch = stub()
    fetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/me/plans')) return Promise.resolve(respond({ limit: 10, plans: [{ id: 7, name: '여름 계획', createdAt: '', updatedAt: '',
        draft: { ...emptyDraft, plan: { currentBankCode: 'kb', monthlyAmount: 300_000 } } }] }))
      if (url.includes('/savings/products')) return Promise.resolve(respond(products))
      if (url.includes('/my-status')) return Promise.resolve(respond(status()))
      return Promise.resolve(respond({ today: '2026-11-03', items: [] }))
    })
    renderPage()

    await user.selectOptions(await screen.findByLabelText('어떤 계획으로 볼까요?'), '7')
    await vi.waitFor(() => {
      const bodies = fetch.mock.calls.filter(([input]) => String(input).includes('/my-status')).map(([, init]) => JSON.parse(String(init?.body)))
      expect(bodies.at(-1)?.fixedMonthlyAmount).toBe(300_000)
    })
  })
})
