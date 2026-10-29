import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyDraft, saveDraft } from '../storage/draftStorage'
import { AlternativesPage } from './AlternativesPage'

const products = {
  policy: { termMonths: 36, minimumMonthlyAmount: 1_000, maximumMonthlyAmount: 500_000, generalContributionRate: 6, preferredContributionRate: 12, taxExempt: true },
  products: [{ bankCode: 'kb', bankName: 'KB국민은행', productName: 'KB 청년미래적금', baseRate: 5, maximumRate: 8, sourceUrl: 'https://example.com', sourceDate: '2026-10-13', conditions: [] }],
}

const assets = {
  assets: [
    { code: 'bond', ticker: 'BND', name: 'Vanguard Total Bond Market ETF', category: 'bond', benchmark: 'Bond index', leveraged: false, warning: '채권도 손실 가능', startMonth: '2023-10', endMonth: '2026-09', availableMonths: 36 },
    { code: 'nasdaq100', ticker: 'QQQ', name: 'Invesco QQQ', category: 'stock', benchmark: 'Nasdaq-100', leveraged: false, warning: '원금 손실 가능', startMonth: '2023-10', endMonth: '2026-09', availableMonths: 36 },
    { code: 'qld', ticker: 'QLD', name: 'ProShares Ultra QQQ', category: 'leveraged', benchmark: '2x daily', leveraged: true, warning: '장기 결과는 단순 2배가 아닙니다.', startMonth: '2023-10', endMonth: '2026-09', availableMonths: 36 },
    { code: 'schd', ticker: 'SCHD', name: 'Schwab Dividend ETF', category: 'dividend', benchmark: 'Dividend index', leveraged: false, warning: '원금 손실 가능', startMonth: '2023-10', endMonth: '2026-09', availableMonths: 36 },
    { code: 'kosdaq150', ticker: '229200.KS', name: 'KODEX 코스닥150', category: 'korean_equity', benchmark: 'KOSDAQ 150', leveraged: false, warning: '코스닥 전체지수가 아니라 코스닥 대표 150종목을 추종합니다.', startMonth: '2023-10', endMonth: '2026-09', availableMonths: 36 },
  ],
  taxIncluded: false, tradingFeeIncluded: false, fxIncluded: true, fractionalShares: true,
}

const resultItem = (code: string, ticker: string | null, leveraged = false) => ({
  kind: ticker ? 'investment' : 'savings', code, name: ticker ? `${ticker} fund` : 'KB국민은행 KB 청년미래적금', ticker,
  principal: 17_500_000, endingValue: ticker ? 20_000_000 : 19_941_250, profitLoss: ticker ? 2_500_000 : 2_441_250,
  returnPercent: ticker ? 14.29 : 13.95, maxDrawdownPercent: ticker ? -12.5 : null, leveraged,
  warning: leveraged ? '장기 결과는 단순 2배가 아닙니다.' : '원금 손실 가능', sourceUrl: 'https://example.com', sourceDate: '2026-09-30',
  taxTreatment: ticker ? '개인별 세금 미반영' : '비과세', feeTreatment: ticker ? '증권사 거래 수수료 미반영' : '수수료 없음', fxTreatment: ticker ? '월별 환율 반영' : '해당 없음',
})

const comparison = {
  startMonth: '2023-10', endMonth: '2026-09', monthlyAmounts: [0, ...Array(35).fill(500_000)],
  results: [resultItem('kb', null), resultItem('bond', 'BND'), resultItem('nasdaq100', 'QQQ'), resultItem('qld', 'QLD', true), resultItem('schd', 'SCHD'), { ...resultItem('kosdaq150', '229200.KS'), name: 'KODEX 코스닥150', fxTreatment: '원화 자산 · 환율 변환 없음' }],
  historicalScenario: true, dividendsReinvested: true, notice: '미래 수익을 예측하거나 특정 상품을 추천하지 않습니다.',
}

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('AlternativesPage', () => {
  it('compares savings and four assets with the same stored cashflow', async () => {
    saveDraft({ ...emptyDraft, plan: { monthlyAmount: 500_000, currentBankCode: 'kb' }, monthlyPayments: { '1': 0 } })
    const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
      const path = String(input)
      const body = path.endsWith('/savings/products') ? products : path.endsWith('/investments/assets') ? assets : comparison
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<MemoryRouter><AlternativesPage /></MemoryRouter>)

    expect(await screen.findByText('과거 시나리오 · 순위나 추천이 아닙니다')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'QLD' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'KODEX 코스닥150' })).toBeInTheDocument()
    expect(screen.getByText('장기 결과는 단순 2배가 아닙니다.')).toBeInTheDocument()
    expect(screen.getAllByText('개인별 세금 미반영')).toHaveLength(5)
    const comparisonCall = await waitFor(() => fetchMock.mock.calls.find(([input]) => String(input).endsWith('/comparisons/calculate')))
    const requestBody = JSON.parse(String(comparisonCall![1]?.body))
    expect(requestBody.monthlyAmounts[0]).toBe(0)
    expect(requestBody.monthlyAmounts).toHaveLength(36)
  })

  it('requires at least one investment alternative', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const path = String(input)
      const body = path.endsWith('/savings/products') ? products : path.endsWith('/investments/assets') ? assets : comparison
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    }))
    render(<MemoryRouter><AlternativesPage /></MemoryRouter>)

    for (const ticker of ['BND', 'QQQ', 'QLD', 'SCHD', '코스닥150']) {
      await user.click(await screen.findByRole('checkbox', { name: new RegExp(ticker) }))
    }
    expect(screen.getByText('비교할 투자 대안을 하나 이상 선택해 주세요.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '같은 현금흐름으로 비교하기' })).toBeDisabled()
  })
})
