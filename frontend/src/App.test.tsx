import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('App', () => {
  it('shows the home page and backend connection result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: 'ok',
            app: 'Very Rich?',
            database: 'ok',
            referenceKey: 'phase1-ready',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: '같은 돈의 다른 미래를 비교하세요.' })).toBeInTheDocument()
    expect(screen.getByText('73%')).toBeInTheDocument()
    expect(await screen.findByText(/FastAPI와 Supabase 연결 완료/)).toBeInTheDocument()
  })

  it('prepares the planned routes', () => {
    vi.stubGlobal('fetch', vi.fn())

    render(
      <MemoryRouter initialEntries={['/cashflow']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: '월별 납입 계획' })).toBeInTheDocument()
  })

  it('opens a desktop app from the start menu', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn())

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: 'Start' }))
    const startMenu = screen.getByRole('navigation', { name: '시작 메뉴' })
    await user.click(within(startMenu).getByRole('link', { name: '내 조건' }))

    expect(screen.getByRole('heading', { name: '내가 지킬 수 있는 조건만 골라주세요.' })).toBeInTheDocument()
  })

  it('minimizes, restores, and maximizes the retro window', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'ok', app: 'Very Rich?', database: 'ok', referenceKey: 'phase1-ready',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    render(<MemoryRouter><App /></MemoryRouter>)

    await user.click(screen.getByRole('button', { name: '창 최소화' }))
    expect(screen.queryByRole('region', { name: 'Very Rich? - 시작' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '현재 창: Very Rich? - 시작' }))
    expect(screen.getByRole('region', { name: 'Very Rich? - 시작' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '창 최대화' }))
    expect(screen.getByRole('button', { name: '창 복원' })).toBeInTheDocument()
  })

  it('moves backward and forward through app windows', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'ok', app: 'Very Rich?', database: 'ok', referenceKey: 'phase1-ready',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    render(<MemoryRouter><App /></MemoryRouter>)

    await user.click(screen.getByRole('link', { name: '납입 계획' }))
    expect(screen.getByRole('heading', { name: '월별 납입 계획' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '뒤로 가기' }))
    expect(screen.getByRole('heading', { name: '같은 돈의 다른 미래를 비교하세요.' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '앞으로 가기' }))
    expect(screen.getByRole('heading', { name: '월별 납입 계획' })).toBeInTheDocument()
  })
})
