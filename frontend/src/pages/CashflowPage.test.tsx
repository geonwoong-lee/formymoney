import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
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

    const firstMonth = await screen.findByRole('textbox', { name: '1개월차 납입액' })
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
    const firstMonth = await screen.findByRole('textbox', { name: '1개월차 납입액' })
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
    const actualMonth = await screen.findByRole('textbox', { name: '1개월차 납입액' })
    await user.clear(actualMonth)
    await user.type(actualMonth, '300000')
    const futureAmount = screen.getByRole('textbox', { name: '앞으로 넣을 금액' })
    await user.clear(futureAmount)
    await user.type(futureAmount, '200000')
    await user.click(screen.getByRole('button', { name: '앞으로 모든 달에 같은 금액 적용' }))

    expect(actualMonth).toHaveValue('300,000')
    expect(screen.getByRole('textbox', { name: '2개월차 납입액' })).toHaveValue('200,000')
    expect(document.querySelectorAll('.cashflow-badge--actual')).toHaveLength(1)
    expect(document.querySelectorAll('.cashflow-badge:not(.cashflow-badge--actual)')).toHaveLength(35)
  })

  it('compares keep, reduce and skip for one month using the FastAPI result', async () => {
    const user = userEvent.setup()
    saveDraft({ ...emptyDraft, plan: { monthlyAmount: 500_000, contributionType: 'general' } })
    const impactResponse = {
      bankCode: 'kb', bankName: 'KB국민은행', monthNumber: 3, termMonths: 36, expectedRate: 5,
      scenarios: [
        { key: 'keep', label: '원래대로 납입', monthAmount: 500_000, principal: 18_000_000, depositInterest: 1, governmentContribution: 1, governmentContributionInterest: 1, expectedMaturityAmount: 20_550_750, differenceFromKeep: 0, depositInterestDifferenceFromKeep: 0, governmentContributionDifferenceFromKeep: 0 },
        { key: 'reduce', label: '감액', monthAmount: 250_000, principal: 17_750_000, depositInterest: 1, governmentContribution: 1, governmentContributionInterest: 1, expectedMaturityAmount: 20_250_000, differenceFromKeep: -300_750, depositInterestDifferenceFromKeep: -1, governmentContributionDifferenceFromKeep: -2 },
        { key: 'skip', label: '미납', monthAmount: 0, principal: 17_500_000, depositInterest: 1, governmentContribution: 1, governmentContributionInterest: 1, expectedMaturityAmount: 19_941_250, differenceFromKeep: -609_500, depositInterestDifferenceFromKeep: -3, governmentContributionDifferenceFromKeep: -4 },
      ],
      unavailableNotes: ['중도해지 조건은 계산하지 않았습니다.'],
      sourceUrl: 'https://example.com', sourceDate: '2026-10-13',
    }
    const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => Promise.resolve(new Response(
      JSON.stringify(String(input).endsWith('/products') ? productsResponse : impactResponse),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )))
    vi.stubGlobal('fetch', fetchMock)

    render(<MemoryRouter><CashflowPage /></MemoryRouter>)

    await user.click(await screen.findByRole('button', { name: '세 가지 비교하기' }))
    const table = await screen.findByRole('table', { name: '한 달 변경 영향 비교' })
    expect(table).toHaveTextContent('-609,500원')
    expect(screen.getByText(/추가 확인 필요: 중도해지/)).toBeInTheDocument()
    const body = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body))
    expect(body).toMatchObject({ monthNumber: 1, reducedAmount: 250_000 })
    const beforeCancel = screen.getByRole('complementary', { name: '해지하기 전에' })
    expect(beforeCancel).toHaveTextContent('우대금리와 정부기여금을 받지 못할 수 있고')
    expect(beforeCancel).toHaveTextContent('권하는 것이 아니라')
    expect(within(beforeCancel).getByRole('link', { name: '만기 후 계획' })).toHaveAttribute('href', '/maturity')
  })

  it('clears the month impact when the plan changes and blocks an impossible reduction', async () => {
    const user = userEvent.setup()
    saveDraft({ ...emptyDraft, plan: { monthlyAmount: 500_000, contributionType: 'general' } })
    const impactResponse = {
      bankCode: 'kb', bankName: 'KB국민은행', monthNumber: 1, termMonths: 36, expectedRate: 5,
      scenarios: [{
        key: 'keep', label: '원래대로 납입', monthAmount: 500_000, principal: 1, depositInterest: 1,
        governmentContribution: 1, governmentContributionInterest: 1, expectedMaturityAmount: 1,
        differenceFromKeep: 0, depositInterestDifferenceFromKeep: 0, governmentContributionDifferenceFromKeep: 0,
      }],
      unavailableNotes: [], sourceUrl: 'https://example.com', sourceDate: '2026-10-13',
    }
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve(new Response(
      JSON.stringify(String(input).endsWith('/products') ? productsResponse : impactResponse),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))))

    render(<MemoryRouter><CashflowPage /></MemoryRouter>)
    await user.click(await screen.findByRole('button', { name: '세 가지 비교하기' }))
    await screen.findByRole('table', { name: '한 달 변경 영향 비교' })

    const firstMonth = screen.getByRole('textbox', { name: '1개월차 납입액' })
    await user.clear(firstMonth)
    await user.type(firstMonth, '200000')
    expect(screen.queryByRole('table', { name: '한 달 변경 영향 비교' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '세 가지 비교하기' })).toBeDisabled()
    expect(screen.getByText(/감액 금액은 1,000원 이상/)).toBeInTheDocument()
  })

  it('removes a previous month impact error when the input changes', async () => {
    const user = userEvent.setup()
    saveDraft({ ...emptyDraft, plan: { monthlyAmount: 500_000, contributionType: 'general' } })
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve(String(input).endsWith('/products')
      ? new Response(JSON.stringify(productsResponse), { status: 200, headers: { 'Content-Type': 'application/json' } })
      : new Response(JSON.stringify({ error: { code: 'http_error', message: '계산 서버 오류' } }), { status: 503, headers: { 'Content-Type': 'application/json' } }))))

    render(<MemoryRouter><CashflowPage /></MemoryRouter>)
    await user.click(await screen.findByRole('button', { name: '세 가지 비교하기' }))
    expect(await screen.findByText(/계산 서버 오류/)).toBeInTheDocument()

    const secondMonth = screen.getByRole('textbox', { name: '2개월차 납입액' })
    await user.clear(secondMonth)
    await user.type(secondMonth, '400000')
    expect(screen.queryByText(/계산 서버 오류/)).not.toBeInTheDocument()
  })

  it('discards a month impact response that arrives after the plan changed', async () => {
    const user = userEvent.setup()
    saveDraft({ ...emptyDraft, plan: { monthlyAmount: 500_000, contributionType: 'general' } })
    let releaseImpact: (response: Response) => void = () => {}
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => String(input).endsWith('/products')
      ? Promise.resolve(new Response(JSON.stringify(productsResponse), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      : new Promise<Response>((resolve) => { releaseImpact = resolve })))

    render(<MemoryRouter><CashflowPage /></MemoryRouter>)
    await user.click(await screen.findByRole('button', { name: '세 가지 비교하기' }))
    const firstMonth = screen.getByRole('textbox', { name: '2개월차 납입액' })
    await user.clear(firstMonth)
    await user.type(firstMonth, '400000')

    releaseImpact(new Response(JSON.stringify({
      bankCode: 'kb', bankName: 'KB국민은행', monthNumber: 1, termMonths: 36, expectedRate: 5,
      scenarios: [{
        key: 'keep', label: '원래대로 납입', monthAmount: 500_000, principal: 1, depositInterest: 1,
        governmentContribution: 1, governmentContributionInterest: 1, expectedMaturityAmount: 1,
        differenceFromKeep: 0, depositInterestDifferenceFromKeep: 0, governmentContributionDifferenceFromKeep: 0,
      }],
      unavailableNotes: [], sourceUrl: 'https://example.com', sourceDate: '2026-10-13',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    await waitFor(() => expect(screen.getByRole('button', { name: '세 가지 비교하기' })).toBeEnabled())
    expect(screen.queryByRole('table', { name: '한 달 변경 영향 비교' })).not.toBeInTheDocument()
  })
})
