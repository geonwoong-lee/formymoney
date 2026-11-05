import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { ANALYTICS_CONSENT_KEY } from './features/analytics'

const estimate = {
  monthlyAmount: 500_000, termMonths: 36, contributionType: 'general', contributionRate: 6, principal: 18_000_000,
  banks: [{ bankCode: 'kb', bankName: 'KB국민은행', productName: 'KB', baseRate: 5, maximumRate: 8, maturityAtBaseRate: 20_550_750, maturityAtMaximumRate: 21_383_250, sourceUrl: 'https://example.com/kb', sourceDate: '2026-08-26' }],
  policySourceUrl: 'https://example.com/policy', policySourceDate: '2026-10-06', disclaimer: '특정 은행·상품을 추천하지 않습니다.',
}

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('widget routing', () => {
  it('shows only the calculator at /embed/savings and calls nothing but the public API', async () => {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, 'yes')  // 동의했어도 위젯은 통계를 보내지 않는다
    const fetchMock = vi.fn((_input: RequestInfo | URL) => Promise.resolve(new Response(JSON.stringify(estimate), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/embed/savings']}><App /></MemoryRouter>)

    expect(await screen.findByText('20,550,750원')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '공시 2026-08-26' })).toHaveAttribute('href', 'https://example.com/kb')
    expect(screen.getByText(/2026-10-06 확인/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Start|시작/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '익명 이용 통계 동의' })).not.toBeInTheDocument()
    expect(screen.queryByText('무엇을 도와 드릴까요?')).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual(['/api/v1/public/savings-estimate'])
  })

  it('does not show the regular screens inside another page frame', () => {
    vi.stubGlobal('fetch', vi.fn())
    vi.spyOn(window, 'top', 'get').mockReturnValue({} as Window)
    render(<MemoryRouter initialEntries={['/me']}><App /></MemoryRouter>)

    expect(screen.getByRole('alert')).toHaveTextContent('다른 페이지 안에서는 열지 않아요')
    expect(screen.getByRole('link', { name: '새 창에서 열기' })).toHaveAttribute('target', '_blank')
  })

  it('still shows the widget inside another page frame', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(estimate), { status: 200, headers: { 'Content-Type': 'application/json' } }))))
    vi.spyOn(window, 'top', 'get').mockReturnValue({} as Window)
    render(<MemoryRouter initialEntries={['/embed/savings']}><App /></MemoryRouter>)

    expect(await screen.findByText('20,550,750원')).toBeInTheDocument()
  })
})
