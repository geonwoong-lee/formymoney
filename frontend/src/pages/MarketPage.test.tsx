import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MarketPage } from './MarketPage'

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
})

const item = (overrides: Record<string, unknown>) => ({
  code: 'usd_krw', name: '원/달러', unit: '원', cycle: 'D', period: '20261030', value: '1337.2',
  previousPeriod: '20261029', change: '13.2', changePercent: '1.00', ...overrides,
})

const market = {
  groups: [
    { key: 'fx', title: '환율', note: '은행 간 매매기준율이며 하루 한 번 갱신합니다.', items: [item({})] },
    { key: 'kr_stock', title: '국내 증시', note: '전 영업일 종가입니다. 실시간 시세가 아닙니다.', items: [
      item({ code: 'kospi', name: '코스피', unit: 'pt', value: '5730.74', change: '-206.92', changePercent: '-3.48' }),
      item({ code: 'kosdaq', name: '코스닥', unit: 'pt', value: '781.97', previousPeriod: null, change: null, changePercent: null }),
    ] },
    { key: 'rate', title: '금리', note: '월별·일별 통계', items: [
      item({ code: 'base_rate', name: '한국은행 기준금리', unit: '%', value: '3', change: '0.25', changePercent: '9.09' }),
    ] },
  ],
  rateTrend: [
    { period: '202607', baseRate: '2.75', depositRate: '3.2' },
    { period: '202608', baseRate: '2.75', depositRate: null },
    { period: '202609', baseRate: '3', depositRate: '3.45' },
    { period: '202610', baseRate: '3', depositRate: null },
  ],
  sourceName: '한국은행 경제통계시스템(ECOS)',
  sourceUrl: 'https://ecos.bok.or.kr/',
  updatedAt: '2026-11-02T00:00:00Z',
}

const renderPage = () => render(<MemoryRouter><MarketPage /></MemoryRouter>)

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('MarketPage', () => {
  it('shows each indicator with its date, direction and the official source', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(respond(market))))
    renderPage()

    const fx = await screen.findByRole('region', { name: '환율' })
    expect(fx).toHaveTextContent('1,337.2원')
    expect(fx).toHaveTextContent('▲ 13.2 (1%)')
    expect(fx).toHaveTextContent('2026년 10월 30일 기준')
    const stocks = screen.getByRole('region', { name: '국내 증시' })
    expect(stocks).toHaveTextContent('▼ 206.92 (3.48%)')
    expect(stocks).toHaveTextContent('비교할 이전 값 없음')
    expect(stocks).toHaveTextContent('실시간 시세가 아닙니다')
    expect(screen.getByRole('region', { name: '금리' })).toHaveTextContent('▲ 0.25%p')
    expect(screen.getByRole('link', { name: /한국은행 경제통계시스템/ })).toHaveAttribute('href', 'https://ecos.bok.or.kr/')
  })

  it('draws the rate trend with a legend and a table view', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(respond(market))))
    renderPage()

    const trend = await screen.findByRole('region', { name: /금리 흐름/ })
    expect(within(trend).getByRole('img', { name: /기준금리와 은행 예금 평균금리/ })).toBeInTheDocument()
    expect(within(trend).getByRole('list', { name: '범례' })).toHaveTextContent('기준금리예금 평균금리')
    await userEvent.click(within(trend).getByText('표로 보기'))
    const rows = within(trend).getAllByRole('row')
    expect(rows).toHaveLength(5)
    expect(rows[4]).toHaveTextContent('2026년 10월3%–')
    const depositPath = trend.querySelector('path.market-trend__line--deposit')?.getAttribute('d') ?? ''
    expect(depositPath.match(/M/g)).toHaveLength(2)  // the missing August breaks the line
    expect(trend).toHaveTextContent('자료가 없는 달은 선을 끊어 표시합니다.')
    expect(trend).toHaveTextContent('앞으로의 금리를 예측하지 않습니다')
  })

  it('says when nothing is collected yet and shows an error with retry on failure', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(respond({ ...market, groups: [], rateTrend: [], updatedAt: null }))))
    renderPage()
    expect(await screen.findByText('아직 수집된 시장 지표가 없습니다.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /금리 흐름/ })).not.toBeInTheDocument()

    cleanup()
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(respond({ error: { code: 'service_unavailable', message: '시장 지표를 불러오지 못했습니다.' } }, 503))))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('시장 지표를 불러오지 못했습니다.')
  })
})
