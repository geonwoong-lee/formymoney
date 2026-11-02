import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ANALYTICS_CONSENT_KEY, track } from '../features/analytics'
import { AnalyticsConsentBar, AnalyticsConsentToggle } from './AnalyticsConsent'

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('anonymous statistics', () => {
  it('sends nothing until the user agrees, then only the event name', async () => {
    const user = userEvent.setup()
    render(<><AnalyticsConsentBar /><AnalyticsConsentToggle /></>)

    track('visit_banks')
    expect(fetch).not.toHaveBeenCalled()
    const bar = screen.getByRole('region', { name: '익명 이용 통계 동의' })
    expect(bar).toHaveTextContent('입력한 금액과 답은 보내지 않아요')

    await user.click(screen.getByRole('button', { name: '보내도 돼요' }))
    expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe('yes')
    expect(screen.queryByRole('region', { name: '익명 이용 통계 동의' })).not.toBeInTheDocument()
    expect(screen.getByText('보내는 중')).toBeInTheDocument()

    track('visit_banks')
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/api\/v1\/analytics\/events$/)
    expect(JSON.parse(String(init.body))).toEqual({ event: 'visit_banks' })

    await user.click(screen.getByRole('button', { name: '그만 보내기' }))
    track('visit_banks')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('remembers a "no" and does not ask again', async () => {
    const user = userEvent.setup()
    const first = render(<AnalyticsConsentBar />)
    await user.click(screen.getByRole('button', { name: '보내지 않을래요' }))
    first.unmount()

    render(<AnalyticsConsentBar />)
    expect(screen.queryByRole('region', { name: '익명 이용 통계 동의' })).not.toBeInTheDocument()
    track('visit_daily')
    expect(fetch).not.toHaveBeenCalled()
  })
})
