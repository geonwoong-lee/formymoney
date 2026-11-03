import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMaturityIcs, buildMonthlyCheckIcs } from '../features/maturityCalendar'
import { loadWatchlist, mergeWatchlists, WATCHLIST_KEY } from '../features/watchlist'
import { MyReminders } from './MyReminders'
import { MyWatchlist } from './MyWatchlist'

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const item = (code: string, kind: 'deposit' | 'saving' = 'deposit', company = '카카오뱅크') => ({ kind, company, productCode: code, productName: `${code} 상품` })

beforeEach(() => window.localStorage.clear())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('MyWatchlist', () => {
  it('lists the starred products, removes one, and offers no account buttons when signed out', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify([item('A'), item('B', 'saving')]))
    render(<MemoryRouter><MyWatchlist /></MemoryRouter>)

    expect(screen.getByText('A 상품')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '내 계정에 저장' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '로그인' })).toHaveAttribute('href', '/auth')
    await user.click(screen.getByRole('button', { name: '카카오뱅크 A 상품 관심 해제' }))
    expect(loadWatchlist().map((entry) => entry.productCode)).toEqual(['B'])
  })

  it('keeps the list on the account only when asked, loads it back merged, and clears it', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('very-rich:auth:v1', JSON.stringify({ accessToken: 'token', refreshToken: null, expiresAt: null }))
    window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify([item('A')]))
    const fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') return Promise.resolve(respond({ items: JSON.parse(String(init.body)).items, updatedAt: null, limit: 30 }))
      if (init?.method === 'DELETE') return Promise.resolve(new Response(null, { status: 204 }))
      return Promise.resolve(respond({ items: [item('A'), item('Z', 'saving')], updatedAt: '2026-11-03T00:00:00Z', limit: 30 }))
    })
    vi.stubGlobal('fetch', fetch)
    render(<MemoryRouter><MyWatchlist /></MemoryRouter>)
    expect(fetch).not.toHaveBeenCalled()  // opening the screen sends nothing

    await user.click(screen.getByRole('button', { name: '내 계정에 저장' }))
    expect(await screen.findByText('관심 상품 1개를 내 계정에 저장했어요.')).toBeInTheDocument()
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({ items: [item('A')] })
    expect(new Headers(fetch.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer token')

    await user.click(screen.getByRole('button', { name: '계정에서 불러오기' }))
    expect(await screen.findByText(/이 기기 것과 합쳤어요\(2개\)/)).toBeInTheDocument()
    expect(loadWatchlist().map((entry) => entry.productCode)).toEqual(['A', 'Z'])

    await user.click(screen.getByRole('button', { name: '계정 저장분 지우기' }))
    expect(await screen.findByText(/이 기기의 목록은 그대로예요/)).toBeInTheDocument()
    expect(loadWatchlist()).toHaveLength(2)
  })

  it('merges without duplicates and within the cap', () => {
    const local = Array.from({ length: 29 }, (_, index) => item(`L${index}`))
    expect(mergeWatchlists([item('A')], [item('A'), item('B')]).map((entry) => entry.productCode)).toEqual(['A', 'B'])
    expect(mergeWatchlists(local, [item('X'), item('Y')])).toHaveLength(30)
  })
})

describe('calendar files', () => {
  const plan = { startMonth: '2026-01', termMonths: 36, bankName: 'KB국민은행', productName: 'KB 청년미래적금' }

  it('repeats on the 25th for every payment month still ahead', () => {
    const ics = buildMonthlyCheckIcs(plan, new Date(2026, 10, 3)) ?? ''
    expect(ics).toContain('DTSTART;VALUE=DATE:20261125')
    expect(ics).toContain('DTEND;VALUE=DATE:20261126')
    expect(ics).toContain('RRULE:FREQ=MONTHLY;COUNT=26')  // Nov 2026 .. Dec 2028, the 36th payment
    expect(ics).toContain('SUMMARY:KB국민은행 우대조건 확인')

    // After the 25th the first reminder moves to next month; before the start it begins at the start.
    expect(buildMonthlyCheckIcs(plan, new Date(2026, 10, 28)) ?? '').toContain('DTSTART;VALUE=DATE:20261225')
    expect(buildMonthlyCheckIcs({ ...plan, startMonth: '2027-03' }, new Date(2026, 10, 3)) ?? '').toContain('DTSTART;VALUE=DATE:20270325')
    expect(buildMonthlyCheckIcs(plan, new Date(2029, 0, 5))).toBeNull()
    expect(buildMonthlyCheckIcs({ ...plan, startMonth: 'bad' })).toBeNull()
  })

  it('offers the maturity file and the monthly file only while they still make sense', async () => {
    const user = userEvent.setup()
    const links: string[] = []
    const create = vi.fn(() => 'blob:x')
    vi.stubGlobal('URL', { ...URL, createObjectURL: create, revokeObjectURL: vi.fn() })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { links.push(this.download) })
    render(<MyReminders {...plan} matured={false} />)
    await user.click(screen.getByRole('button', { name: '만기 알림(.ics)' }))
    await user.click(screen.getByRole('button', { name: '매달 우대조건 확인 알림(.ics)' }))
    expect(links).toEqual(['very-rich-maturity.ics', 'very-rich-condition-check.ics'])
    expect(buildMaturityIcs(plan)).toContain('SUMMARY:KB국민은행 KB 청년미래적금 만기 달')

    cleanup()
    render(<MyReminders {...plan} matured />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    click.mockRestore()
  })
})
