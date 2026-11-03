import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadWatchlist, MAX_WATCHED, toggleWatched, WATCHLIST_KEY } from '../features/watchlist'
import { emptyDraft, saveDraft } from '../storage/draftStorage'
import { RateAlerts } from './RateAlerts'

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const change = (company: string, code: string, before: string, after: string, point: string) => ({
  kind: 'deposit', company, productCode: code, productName: `${code} 정기예금`, termMonths: 12, rateType: '단리',
  fieldLabel: '기본금리', before, after, changePoint: point,
})

const alerts = (overrides: Record<string, unknown> = {}) => ({
  latestDay: '2026-11-04', previousDay: '2026-11-03',
  bank: { bankCode: 'kb', company: '국민은행', changes: [change('국민은행', 'KB1', '3.00', '2.90', '-0.10')] },
  watched: [change('주식회사 카카오뱅크', 'KK1', '3.10', '3.20', '0.10')],
  sourceName: '금융감독원 금융상품 한눈에', sourceUrl: 'https://finlife.fss.or.kr/', ...overrides,
})

const renderAlerts = () => render(<MemoryRouter><RateAlerts /></MemoryRouter>)

beforeEach(() => window.localStorage.clear())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('RateAlerts', () => {
  it('asks nothing when there is no savings bank and no starred product', () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    renderAlerts()
    expect(fetch).not.toHaveBeenCalled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows my bank and starred product moves, sends only what to look at, and hides for the day', async () => {
    const user = userEvent.setup()
    saveDraft({ ...emptyDraft, plan: { currentBankCode: 'kb', monthlyAmount: 500_000 } })
    toggleWatched([], { kind: 'deposit', company: '카카오뱅크', productCode: 'KK1', productName: 'KK1 정기예금' })
    const fetch = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => Promise.resolve(respond(alerts())))
    vi.stubGlobal('fetch', fetch)
    renderAlerts()

    const box = await screen.findByRole('status')
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({ bankCode: 'kb', watch: [{ kind: 'deposit', company: '카카오뱅크', productCode: 'KK1' }] })
    expect(box).toHaveTextContent('11월 3일과 11월 4일에')
    const lists = within(box).getAllByRole('list')
    expect(lists[0]).toHaveTextContent('▲ 0.1%p 카카오뱅크 KK1 정기예금 · 예금 12개월 단리 기본금리 3.10% → 3.20%')
    expect(lists[1]).toHaveTextContent('▼ 0.1%p 국민은행 KB1 정기예금')
    expect(box).toHaveTextContent('내 적금 은행(국민은행)의 다른 예·적금')
    expect(box).toHaveTextContent('가입·해지를 권하지 않아요')
    expect(box).not.toHaveTextContent('500,000')  // nothing about the user's own plan is sent or shown

    await user.click(within(box).getByRole('button', { name: '오늘은 그만 보기' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    cleanup()
    renderAlerts()
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('stays hidden on the first collection day or when nothing of mine moved', async () => {
    saveDraft({ ...emptyDraft, plan: { currentBankCode: 'kb' } })
    const fetch = vi.fn(() => Promise.resolve(respond(alerts({ previousDay: null }))))
    vi.stubGlobal('fetch', fetch)
    renderAlerts()
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    cleanup()
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(respond(alerts({ bank: { bankCode: 'kb', company: '국민은행', changes: [] }, watched: [] })))))
    renderAlerts()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('watchlist', () => {
  it('toggles, survives a reload, caps the list and ignores broken storage', () => {
    const product = { kind: 'deposit' as const, company: '가은행', productCode: 'A', productName: 'A 예금' }
    let list = toggleWatched([], product)
    expect(loadWatchlist()).toEqual([product])
    list = toggleWatched(list, product)
    expect(loadWatchlist()).toEqual([])

    const full = Array.from({ length: MAX_WATCHED }, (_, index) => ({ ...product, productCode: `P${index}` }))
    expect(toggleWatched(full, product)).toHaveLength(MAX_WATCHED)
    window.localStorage.setItem(WATCHLIST_KEY, '{broken')
    expect(loadWatchlist()).toEqual([])
    expect(list).toEqual([])
  })
})
