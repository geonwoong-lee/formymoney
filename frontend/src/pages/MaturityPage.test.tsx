import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DRAFT_STORAGE_KEY } from '../storage/draftStorage'
import { MaturityPage } from './MaturityPage'
import { profileFromAnswers } from './maturityProfile'

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const history = (average: string, best: string, worst: string, loss: number) => ({
  windows: 24, firstStart: '2023-10', lastStart: '2025-09', averagePercent: average, bestPercent: best, worstPercent: worst,
  lossWindows: loss, averageValue: 10_500_000, bestValue: 13_000_000, worstValue: 9_000_000,
})

const option = (code: string, fitsProfile: boolean, extra: Record<string, unknown>) => ({
  code, name: code, kind: 'index', riskLevel: 3, riskLabel: '높음, 원금 손실 가능', principalProtected: false, fitsProfile,
  summary: `${code} 설명`, warning: `${code} 주의`, deposit: null, history: history('5', '30', '-10', 4),
  sourceName: '월말 조정주가와 원/달러 환율', sourceUrl: 'https://finance.yahoo.com/x', ...extra,
})

function plan(profile: string, mix: unknown = null) {
  return {
    amount: 10_000_000, months: 12, profile, dataStart: '2023-10', dataEnd: '2026-09', checkedOn: '2026-11-02',
    options: [
      option('deposit', true, {
        name: '예금에 다시 맡기기', kind: 'deposit', riskLevel: 0, riskLabel: '원금 보장(예금자보호 한도 안)', principalProtected: true,
        history: null, deposit: { ratePercent: '3.00', ratePeriod: '202609', interest: 300_000, tax: 46_200, endingValue: 10_300_000, endingValueAfterTax: 10_253_800 },
        sourceName: '한국은행 경제통계시스템(ECOS)', sourceUrl: 'https://ecos.bok.or.kr/',
      }),
      option('bond', true, { name: 'Vanguard Total Bond Market ETF(BND)', kind: 'bond', riskLevel: 1, riskLabel: '낮은 편, 원금 손실 가능' }),
      option('nasdaq100', false, { name: 'Invesco QQQ Trust(QQQ)' }),
      option('qld', false, { name: 'ProShares Ultra QQQ(QLD)', riskLevel: 4, sourceUrl: 'javascript:alert(1)' }),
    ],
    mix, notes: ['미래 수익을 예측하거나 보장하지 않아요.', '어떤 상품에 가입하거나 투자하라고 권하지 않아요.'],
  }
}

const noProducts = {
  amount: 10_000_000, months: 12, group: '은행', day: null, count: 0, lowest: null, middle: null, highest: null,
  products: [], notes: [], sourceName: '금융감독원 금융상품 한눈에', sourceUrl: 'https://finlife.fss.or.kr/',
}

function stubServer(handler: (url: string, body: Record<string, unknown>) => Response) {
  const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    // The "실제 정기예금으로 보면" step has its own tests; here it only needs an empty answer.
    if (url.includes('/deposit-products')) return Promise.resolve(respond(noProducts))
    return Promise.resolve(handler(url, init?.body ? JSON.parse(String(init.body)) : {}))
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

const planCalls = (fetch: ReturnType<typeof stubServer>) => fetch.mock.calls
  .filter(([input]) => String(input).endsWith('/maturity-plan'))
  .map(([, init]) => JSON.parse(String(init?.body)))

const renderPage = () => render(<MemoryRouter><MaturityPage /></MemoryRouter>)

beforeEach(() => window.localStorage.clear())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('MaturityPage', () => {
  it('waits for a profile, then shows the fitting choices first and keeps the others', async () => {
    const user = userEvent.setup()
    const fetch = stubServer((_url, body) => respond(plan(String(body.profile))))
    renderPage()

    expect(screen.getByText('성향을 고르면 선택지를 보여 드려요.')).toBeInTheDocument()
    expect(planCalls(fetch)).toEqual([])
    await user.click(screen.getByRole('radio', { name: /안정형/ }))

    const fitting = await screen.findByRole('list', { name: '성향에 맞는 선택지' })
    expect(planCalls(fetch).at(-1)).toEqual({ amount: 10_000_000, months: 12, profile: 'stable' })
    expect(screen.getByRole('heading', { name: '3. 안정형에 맞는 선택지' })).toBeInTheDocument()
    const cards = within(fitting).getAllByRole('listitem')
    expect(cards).toHaveLength(2)
    expect(cards[0]).toHaveTextContent('원금 손실 없음')
    expect(cards[0]).toHaveTextContent('12개월 뒤 10,300,000원')
    expect(cards[0]).toHaveTextContent('세금(15.4%) 뗀 뒤 10,253,800원')
    expect(cards[1]).toHaveTextContent('원금 손실 가능')
    expect(cards[1]).toHaveTextContent('가장 나빴을 때-10%')
    expect(cards[1]).toHaveTextContent('24번 중 4번')
    // A <dl> may hold only term/description pairs (screen readers read the list wrongly otherwise): the explaining sentence sits outside it.
    for (const list of document.querySelectorAll('dl.maturity-history')) {
      expect([...list.children].every((child) => child.tagName === 'DIV')).toBe(true)
      expect(list.nextElementSibling?.tagName).toBe('P')
    }

    const others = screen.getByRole('list', { name: '다른 성향의 선택지' })
    expect(within(others).getAllByRole('listitem')).toHaveLength(2)
    expect(within(others).queryByRole('link', { name: /월말 조정주가/ })).toBeInTheDocument()
    expect(within(within(others).getAllByRole('listitem')[1]).queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: '계산 안내' })).toHaveTextContent('권하지 않아요')
  })

  it('picks a profile from the three questions', async () => {
    const user = userEvent.setup()
    const fetch = stubServer((_url, body) => respond(plan(String(body.profile))))
    renderPage()

    await user.click(screen.getByText('잘 모르겠다면 질문 3개로 확인해 보기'))
    await user.click(screen.getByRole('radio', { name: '괜찮아요' }))
    await user.click(screen.getByRole('radio', { name: '3년 넘게 안 써도 돼요' }))
    await user.click(screen.getByRole('radio', { name: '펀드·ETF를 조금 해 봤어요' }))
    await user.click(screen.getByRole('button', { name: '이 답으로 성향 고르기' }))

    expect(screen.getByRole('radio', { name: /공격형/ })).toBeChecked()
    await waitFor(() => expect(planCalls(fetch).at(-1)?.profile).toBe('aggressive'))
    expect([profileFromAnswers([0, 1, 0]), profileFromAnswers([1, 1, 1]), profileFromAnswers([2, 2, 1])]).toEqual(['stable', 'balanced', 'aggressive'])
  })

  it('mixes the deposit with a chosen investment and sends the share', async () => {
    const user = userEvent.setup()
    const fetch = stubServer((_url, body) => respond(plan(String(body.profile), body.mix
      ? { assetCode: 'nasdaq100', assetName: 'Invesco QQQ Trust(QQQ)', depositShare: (body.mix as { depositShare: number }).depositShare, history: history('3.5', '10', '0.5', 0) }
      : null)))
    renderPage()
    await user.click(screen.getByRole('radio', { name: /중립형/ }))
    await screen.findByRole('list', { name: '성향에 맞는 선택지' })

    expect(screen.getByRole('slider')).toBeDisabled()
    await user.selectOptions(screen.getByLabelText('섞어 볼 투자'), 'nasdaq100')

    await waitFor(() => expect(planCalls(fetch).at(-1)).toEqual({ amount: 10_000_000, months: 12, profile: 'balanced', mix: { assetCode: 'nasdaq100', depositShare: 70 } }))
    const mixed = await screen.findByLabelText('섞었을 때 결과')
    expect(mixed).toHaveTextContent('예금 70% + Invesco QQQ Trust(QQQ) 30%')
    expect(mixed).toHaveTextContent('24번 중 0번')
    expect(within(screen.getByLabelText('섞어 볼 투자')).queryByRole('option', { name: '예금에 다시 맡기기' })).not.toBeInTheDocument()
  })

  it('checks the amount before asking and hides an old result', async () => {
    const user = userEvent.setup()
    const fetch = stubServer((_url, body) => respond(plan(String(body.profile))))
    renderPage()
    await user.click(screen.getByRole('radio', { name: /안정형/ }))
    await screen.findByRole('list', { name: '성향에 맞는 선택지' })

    const amount = screen.getByLabelText('만기 금액(원)')
    await user.clear(amount)
    await user.type(amount, '5000')
    expect(screen.getByRole('alert')).toHaveTextContent('만기 금액은 100,000원부터')
    expect(screen.queryByRole('list', { name: '성향에 맞는 선택지' })).not.toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(planCalls(fetch).every((body) => body.amount !== 5000)).toBe(true)
  })

  it('fills the amount by itself when it is opened from 내 적금', async () => {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
      version: 1, plan: { monthlyAmount: 500_000, contributionType: 'general', currentBankCode: 'kb', startMonth: '2026-07' }, conditions: {}, monthlyPayments: {},
    }))
    stubServer((url) => url.includes('/savings/products')
      ? respond({ products: [{ bankCode: 'kb', conditions: [] }] })
      : respond({ termMonths: 36, results: [{ bankCode: 'kb', bankName: 'KB국민은행', productName: '청년미래적금', expectedMaturityAmount: 19_941_250 }] }))
    render(<MemoryRouter initialEntries={['/maturity?from=my-savings']}><MaturityPage /></MemoryRouter>)

    expect(await screen.findByText('KB국민은행 청년미래적금의 예상 만기 금액을 넣었어요.')).toBeInTheDocument()
    expect(screen.getByLabelText('만기 금액(원)')).toHaveValue('19,941,250')
  })

  it('fills the amount from the saved savings plan', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
      version: 1, plan: { monthlyAmount: 500_000, contributionType: 'general', currentBankCode: 'kb', startMonth: '2026-07' }, conditions: {}, monthlyPayments: {},
    }))
    const fetch = stubServer((url) => url.includes('/savings/products')
      ? respond({ products: [{ bankCode: 'kb', conditions: [] }] })
      : respond({ termMonths: 36, results: [{ bankCode: 'kb', bankName: 'KB국민은행', productName: '청년미래적금', expectedMaturityAmount: 19_941_250 }] }))
    renderPage()

    await user.click(screen.getByRole('button', { name: '내 적금 계산에서 가져오기' }))

    expect(await screen.findByText('KB국민은행 청년미래적금의 예상 만기 금액을 넣었어요.')).toBeInTheDocument()
    expect(screen.getByLabelText('만기 금액(원)')).toHaveValue('19,941,250')
    const calculate = fetch.mock.calls.find(([input]) => String(input).includes('/savings/calculate'))
    expect(JSON.parse(String(calculate?.[1]?.body))).toMatchObject({ monthlyAmount: 500_000, bankCodes: ['kb'], currentBankCode: 'kb' })
    expect(screen.getByText(/예상 만기 달/)).toHaveTextContent('예상 만기 달: 2029년 7월')
    const created: string[] = []
    vi.stubGlobal('URL', Object.assign(Object.create(URL), { createObjectURL: (blob: Blob) => { created.push(blob.type); return 'blob:x' }, revokeObjectURL: () => undefined }))
    await user.click(screen.getByRole('button', { name: '캘린더에 만기 알림 넣기(.ics)' }))
    expect(created).toEqual(['text/calendar;charset=utf-8'])

    cleanup()
    window.localStorage.clear()
    renderPage()
    await userEvent.setup().click(screen.getByRole('button', { name: '내 적금 계산에서 가져오기' }))
    expect(screen.getByText(/저장된 계산이 없어요/)).toBeInTheDocument()
  })
})
