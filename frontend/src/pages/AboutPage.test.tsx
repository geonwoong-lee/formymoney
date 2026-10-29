import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AboutPage } from './AboutPage'

const products = {
  policy: { termMonths: 36, minimumMonthlyAmount: 1_000, maximumMonthlyAmount: 500_000, generalContributionRate: 6, preferredContributionRate: 12, taxExempt: true },
  products: [{ bankCode: 'kb', bankName: 'KB국민은행', productName: 'KB 청년미래적금', baseRate: 5, maximumRate: 8, sourceUrl: 'https://example.com/bank', sourceDate: '2026-10-13', conditions: [] }],
}

const investments = {
  assets: [{ code: 'nasdaq100', ticker: 'QQQ', name: 'Invesco QQQ', category: 'stock', currency: 'USD', benchmark: 'Nasdaq-100', leveraged: false, expenseRatioPercent: 0.2, distributionPolicy: 'adjusted close', providerSourceUrl: 'https://example.com/provider', priceSourceUrl: 'https://example.com/price', fxSourceUrl: 'https://example.com/fx', sourceDate: '2026-09-30', warning: '원금 손실 가능', startMonth: '2023-10', endMonth: '2026-09', availableMonths: 36 }],
  taxIncluded: false, tradingFeeIncluded: false, fxIncluded: true, fractionalShares: true,
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('AboutPage', () => {
  it('shows survey, calculation rules, live product sources, and limitations', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve(new Response(
      JSON.stringify(String(input).endsWith('/savings/products') ? products : investments),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))))

    render(<AboutPage />)

    expect(screen.getByRole('heading', { name: '계산 기준과 출처' })).toBeInTheDocument()
    expect(screen.getByText(/전국 만 20~34세 금융소비자 266명/)).toBeInTheDocument()
    expect(screen.getByText(/모름.*추가 확인이 필요한 조건/)).toBeInTheDocument()
    expect(await screen.findByText('KB국민은행')).toBeInTheDocument()
    expect(screen.getByText(/QQQ · Invesco QQQ/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /공시 원문/ })).toHaveAttribute('href', 'https://example.com/bank')
    expect(screen.getByText('개인별 세금과 증권사 거래 수수료')).toBeInTheDocument()
  })

  it('keeps static rules visible and retries when source APIs fail', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('network'))
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(new Response(JSON.stringify(products), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(investments), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    render(<AboutPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('현재 상품별 출처는 확인할 수 없습니다')
    expect(screen.getByRole('heading', { name: '2. 적금 계산 방법' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '다시 불러오기' }))
    expect(await screen.findByText('KB국민은행')).toBeInTheDocument()
  })
})
