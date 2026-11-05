import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyDraft, saveDraft } from '../storage/draftStorage'
import { defaultPaidMonths } from '../features/earlyExit'
import { EarlyExitPage } from './EarlyExitPage'

const productsResponse = {
  policy: {
    termMonths: 36, minimumMonthlyAmount: 1_000, maximumMonthlyAmount: 500_000,
    generalContributionRate: 6, preferredContributionRate: 12, taxExempt: true,
  },
  products: [
    { bankCode: 'kb', bankName: 'KB국민은행', productName: 'KB 청년미래적금', baseRate: 5, maximumRate: 8, sourceUrl: 'https://example.com', sourceDate: '2026-10-13', conditions: [] },
    { bankCode: 'kakao', bankName: '카카오뱅크', productName: '카카오뱅크 청년미래적금', baseRate: 5, maximumRate: 7, sourceUrl: 'https://example.com', sourceDate: '2026-10-13', conditions: [] },
  ],
}

const scenario = (key: string, label: string, futureMonthlyAmount: number | null, principal: number, expectedMaturityAmount: number) => ({
  key, label, futureMonthlyAmount, principal, depositInterest: 0, governmentContribution: 0, governmentContributionInterest: 0,
  expectedMaturityAmount, extraPrincipal: principal - 6_000_000, moreThanTermination: expectedMaturityAmount - 6_137_475,
})

const earlyExitResponse = {
  bankCode: 'kakao', bankName: '카카오뱅크', paidMonths: 12, termMonths: 36, monthsLeft: 24,
  baseRate: 5, expectedRate: 5, interestTaxRate: 15.4,
  termination: { principal: 6_000_000, interestAtBaseRate: 162_500, interestTax: 25_025, receivedAtBaseRate: 6_137_475, lostGovernmentContribution: 360_000 },
  scenarios: [
    scenario('keep', '원래 계획대로 넣기', null, 18_000_000, 20_550_750),
    scenario('pause', '남은 달 쉬고 만기까지 두기', 0, 6_000_000, 7_168_250),
    scenario('minimum', '남은 달 최소 금액만 넣기', 1_000, 6_024_000, 7_200_000),
  ],
  specialTerminationReasons: ['가입자의 사망 또는 해외 이주'],
  specialTerminationSource: '카카오뱅크 청년미래적금 상품 안내', specialTerminationSourceUrl: 'https://example.com/kakao', specialTerminationSourceDate: '2026-11-05',
  unavailableNotes: ['은행별 중도해지 이율은 계산하지 않았습니다.'],
  sourceUrl: 'https://example.com', sourceDate: '2026-10-13',
}

function stubFetch() {
  const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => Promise.resolve(new Response(
    JSON.stringify(String(input).endsWith('/products') ? productsResponse : earlyExitResponse),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('defaultPaidMonths', () => {
  it('counts rounds from the start month for someone who joined, inside 1..term-1', () => {
    const today = new Date(2026, 10, 5) // 2026년 11월
    expect(defaultPaidMonths('2026-07', true, 36, today)).toBe(5)
    expect(defaultPaidMonths('2026-07', false, 36, today)).toBe(12)
    expect(defaultPaidMonths(undefined, true, 36, today)).toBe(12)
    expect(defaultPaidMonths('2030-01', true, 36, today)).toBe(1)
    expect(defaultPaidMonths('2020-01', true, 36, today)).toBe(35)
  })
})

describe('EarlyExitPage', () => {
  it('sends the saved plan for the joined bank and shows what is received, lost and kept', async () => {
    const user = userEvent.setup()
    saveDraft({
      ...emptyDraft,
      plan: { monthlyAmount: 500_000, contributionType: 'general', currentBankCode: 'kakao' },
      monthlyPayments: { '1': 0 },
    })
    const fetchMock = stubFetch()

    render(<MemoryRouter><EarlyExitPage /></MemoryRouter>)

    expect(await screen.findByRole('combobox', { name: '가입한 은행' })).toHaveValue('kakao')
    await user.selectOptions(screen.getByRole('combobox', { name: '지금까지 낸 회차' }), '12')
    await user.click(screen.getByRole('button', { name: '계산하기' }))

    expect(await screen.findByText('6,137,475원')).toBeInTheDocument()
    const body = JSON.parse(String(fetchMock.mock.calls.find(([url]) => String(url).endsWith('/early-exit'))?.[1]?.body))
    expect(body).toMatchObject({ bankCode: 'kakao', paidMonths: 12, fixedMonthlyAmount: 500_000, contributionType: 'general' })
    expect(body.monthlyAmounts).toHaveLength(36)
    expect(body.monthlyAmounts[0]).toBe(0)
    expect(body.monthlyAmounts[1]).toBe(500_000)

    expect(screen.getByText('360,000원')).toBeInTheDocument()
    expect(screen.getByText('+1,030,775원')).toBeInTheDocument()
    // 최소 금액만 넣기는 더 넣는 원금이 있다는 것을 함께 보여 준다.
    expect(screen.getByText('+1,062,525원(더 넣는 원금 24,000원 포함)')).toBeInTheDocument()
    expect(screen.getByText('원금이 달라 비교하지 않음')).toBeInTheDocument()
    // 저장값이 있으면 가정값 안내가 없다(시작 월이 없어 회차만 가정).
    expect(screen.getByRole('note')).toHaveTextContent('위에서 고른 회차')
    expect(screen.getByRole('note')).not.toHaveTextContent('월 50만 원')
    expect(screen.getByRole('table', { name: '해지하지 않는 방법 비교' })).toBeInTheDocument()
    expect(screen.getByText('가입자의 사망 또는 해외 이주')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '카카오뱅크 청년미래적금 상품 안내' })).toHaveAttribute('href', 'https://example.com/kakao')
    expect(screen.getByText(/추가 확인 필요: 은행별 중도해지 이율/)).toBeInTheDocument()
    // 이 화면은 권하지 않는다.
    expect(document.body.textContent).not.toMatch(/추천|하세요\.|권해요/)
  })

  it('says which values are assumed when nothing is saved', async () => {
    const fetchMock = stubFetch()
    render(<MemoryRouter><EarlyExitPage /></MemoryRouter>)

    const note = await screen.findByRole('note')
    expect(note).toHaveTextContent('월 50만 원 납입')
    expect(note).toHaveTextContent('일반형 정부기여금')
    await userEvent.setup().click(screen.getByRole('button', { name: '계산하기' }))
    await screen.findByText('6,137,475원')
    const body = JSON.parse(String(fetchMock.mock.calls.find(([url]) => String(url).endsWith('/early-exit'))?.[1]?.body))
    expect(body).toMatchObject({ bankCode: 'kb', paidMonths: 12, fixedMonthlyAmount: 500_000, contributionType: 'general' })
    expect(body.monthlyAmounts).toEqual(Array(36).fill(500_000))
  })

  it('ignores an answer that arrives after the input changed', async () => {
    const user = userEvent.setup()
    let release: (value: Response) => void = () => {}
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => String(input).endsWith('/products')
      ? Promise.resolve(new Response(JSON.stringify(productsResponse), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      : new Promise<Response>((resolve) => { release = resolve })))
    render(<MemoryRouter><EarlyExitPage /></MemoryRouter>)

    await user.click(await screen.findByRole('button', { name: '계산하기' }))
    await user.selectOptions(screen.getByRole('combobox', { name: '지금까지 낸 회차' }), '3')
    release(new Response(JSON.stringify(earlyExitResponse), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByText('6,137,475원')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '계산하기' })).toBeEnabled()
  })

  it('clears the old result when the input changes', async () => {
    const user = userEvent.setup()
    stubFetch()
    render(<MemoryRouter><EarlyExitPage /></MemoryRouter>)

    await user.click(await screen.findByRole('button', { name: '계산하기' }))
    expect(await screen.findByText('6,137,475원')).toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: '지금까지 낸 회차' }), '3')
    await waitFor(() => expect(screen.queryByText('6,137,475원')).not.toBeInTheDocument())
  })
})
