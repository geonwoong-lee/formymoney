import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminPage } from './AdminPage'

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('AdminPage', () => {
  it('sends the typed secret only as the internal header and lists sources, runs and visits', async () => {
    const user = userEvent.setup()
    const fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/collection/overview')) return Promise.resolve(respond({
        today: '2026-11-05', productRates: { day: '2026-11-05', rows: 3000, stale: false }, productInfos: { rows: 612 },
        loans: { day: '2026-11-01', rows: 95, stale: true }, dart: { banks: 11, latestFilingDay: '2026-11-04' },
        market: [{ code: 'base_rate', name: '한국은행 기준금리', period: '20261104', fetchedAt: '2026-11-04T22:00:00Z' }],
      }))
      if (url.includes('/runs/status')) return Promise.resolve(respond({
        latestStatus: 'partial', todayTokens: 10, dailyTokenLimit: 1000, tokenLimitExceeded: false,
        recent: [{ id: 1, workflow: 'market', status: 'partial', stage: 'ECOS', errorMessage: 'ECOS에 연결하지 못했습니다.', published: 0, finishedAt: '2026-11-04T22:00:00Z' }],
      }))
      return Promise.resolve(respond({ start: '2026-10-30', end: '2026-11-05', steps: [
        { event: 'visit_conditions', label: '내 조건 방문', inFunnel: true, count: 40, ofFirstStepPercent: 100 },
        { event: 'visit_banks', label: '은행 비교 방문', inFunnel: true, count: 10, ofFirstStepPercent: 25 },
      ] }))
    })
    vi.stubGlobal('fetch', fetch)
    render(<AdminPage />)

    await user.click(screen.getByRole('button', { name: '불러오기' }))
    expect(screen.getByRole('alert')).toHaveTextContent('내부 비밀값을 넣어 주세요.')
    expect(fetch).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('내부 비밀값'), 'secret-value')
    await user.click(screen.getByRole('button', { name: '불러오기' }))

    expect(await screen.findByText('전세자금대출')).toBeInTheDocument()
    for (const call of fetch.mock.calls) expect(new Headers((call as unknown as [string, RequestInit])[1].headers).get('X-Very-Rich-Ingest-Secret')).toBe('secret-value')
    expect(screen.getByText('오래됨')).toBeInTheDocument()
    expect(screen.getByText('일부 실패')).toBeInTheDocument()
    expect(screen.getByText('ECOS에 연결하지 못했습니다.')).toBeInTheDocument()
    expect(screen.getByText('25%')).toBeInTheDocument()
    expect(window.localStorage.length).toBe(0)
  })

  it('shows the server refusal when the secret is wrong', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(respond({ error: { message: '내부 요청 인증에 실패했습니다.' } }, 401))))
    render(<AdminPage />)
    await user.type(screen.getByLabelText('내부 비밀값'), 'nope')
    await user.click(screen.getByRole('button', { name: '불러오기' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('내부 요청 인증에 실패했습니다.')
  })
})
