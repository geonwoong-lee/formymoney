import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyDraft, loadDraft, saveDraft } from '../storage/draftStorage'
import { CashflowPage } from './CashflowPage'

const productsResponse = {
  policy: {
    termMonths: 36,
    minimumMonthlyAmount: 1_000,
    maximumMonthlyAmount: 500_000,
    generalContributionRate: 6,
    preferredContributionRate: 12,
    taxExempt: true,
  },
  products: [{
    bankCode: 'kb', bankName: 'KB국민은행', productName: 'KB 청년미래적금',
    baseRate: 5, maximumRate: 8, sourceUrl: 'https://example.com', sourceDate: '2026-10-13',
    conditions: [],
  }],
}

const calculationResponse = {
  bankCode: 'kb', termMonths: 36, monthlyAmounts: [0, ...Array(35).fill(500_000)],
  result: {
    bankCode: 'kb', bankName: 'KB국민은행', productName: 'KB 청년미래적금',
    baseRate: 5, maximumRate: 8, appliedBonusRate: 0, expectedRate: 5,
    principal: 17_500_000, depositInterest: 1_312_500,
    governmentContribution: 1_050_000, governmentContributionInterest: 78_750,
    expectedMaturityAmount: 19_941_250, differenceFromCurrentBank: null,
    conditions: [], sourceUrl: 'https://example.com', sourceDate: '2026-10-13',
  },
  fixedExpectedMaturityAmount: 20_550_750,
  differenceFromFixedPlan: -609_500,
}

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('CashflowPage', () => {
  it('stores a zero-payment month and calculates it through FastAPI', async () => {
    const user = userEvent.setup()
    saveDraft({ ...emptyDraft, plan: { monthlyAmount: 500_000, contributionType: 'general' } })
    const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => Promise.resolve(new Response(
      JSON.stringify(String(input).endsWith('/products') ? productsResponse : calculationResponse),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )))
    vi.stubGlobal('fetch', fetchMock)

    render(<MemoryRouter><CashflowPage /></MemoryRouter>)

    const firstMonth = await screen.findByRole('spinbutton', { name: '1개월차 납입액' })
    await user.clear(firstMonth)
    await user.type(firstMonth, '0')
    await waitFor(() => expect(loadDraft().monthlyPayments['1']).toBe(0))
    await user.click(screen.getByRole('button', { name: '월별 금액으로 다시 계산' }))

    expect(await screen.findByText('19,941,250원')).toBeInTheDocument()
    expect(screen.getByText('-609,500원')).toBeInTheDocument()
    const postCall = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/calculate-cashflow'))
    expect(postCall).toBeDefined()
    const body = JSON.parse(String(postCall![1]?.body))
    expect(body.monthlyAmounts[0]).toBe(0)
    expect(body.monthlyAmounts).toHaveLength(36)
  })

  it('marks only invalid months and does not calculate them', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(productsResponse), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })))

    render(<MemoryRouter><CashflowPage /></MemoryRouter>)
    const firstMonth = await screen.findByRole('spinbutton', { name: '1개월차 납입액' })
    await user.clear(firstMonth)
    await user.type(firstMonth, '999')

    expect(firstMonth).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('금액 확인 필요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '월별 금액으로 다시 계산' })).toBeDisabled()
  })

  it('applies one amount only to future months', async () => {
    const user = userEvent.setup()
    const now = new Date()
    const startMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    saveDraft({ ...emptyDraft, plan: { monthlyAmount: 500_000, enrollmentStatus: 'enrolled', startMonth } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(productsResponse), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })))

    render(<MemoryRouter><CashflowPage /></MemoryRouter>)
    const actualMonth = await screen.findByRole('spinbutton', { name: '1개월차 납입액' })
    await user.clear(actualMonth)
    await user.type(actualMonth, '300000')
    const futureAmount = screen.getByRole('spinbutton', { name: '앞으로 넣을 금액' })
    await user.clear(futureAmount)
    await user.type(futureAmount, '200000')
    await user.click(screen.getByRole('button', { name: '앞으로 모든 달에 같은 금액 적용' }))

    expect(actualMonth).toHaveValue(300_000)
    expect(screen.getByRole('spinbutton', { name: '2개월차 납입액' })).toHaveValue(200_000)
    expect(document.querySelectorAll('.cashflow-badge--actual')).toHaveLength(1)
    expect(document.querySelectorAll('.cashflow-badge:not(.cashflow-badge--actual)')).toHaveLength(35)
  })
})
