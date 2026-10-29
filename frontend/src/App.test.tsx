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

  it('opens several desktop apps and lists every window on the taskbar', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn())

    render(<MemoryRouter><App /></MemoryRouter>)

    await user.click(screen.getByRole('button', { name: '내 폴더' }))
    const folder = screen.getByRole('region', { name: '내 폴더' })
    await user.click(within(folder).getByRole('button', { name: '메모장' }))
    await user.click(within(folder).getByRole('button', { name: '계산기' }))

    expect(screen.getByRole('region', { name: '제목 없음 - 메모장' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '계산기' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '열린 창: 제목 없음 - 메모장' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '열린 창: 계산기' })).toBeInTheDocument()
  })

  it('calculates with the playable retro calculator', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn())

    render(<MemoryRouter><App /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: '내 폴더' }))
    await user.click(within(screen.getByRole('region', { name: '내 폴더' })).getByRole('button', { name: '계산기' }))
    const calculator = screen.getByRole('region', { name: '계산기' })
    await user.click(within(calculator).getByRole('button', { name: '7' }))
    await user.click(within(calculator).getByRole('button', { name: '+' }))
    await user.click(within(calculator).getByRole('button', { name: '3' }))
    await user.click(within(calculator).getByRole('button', { name: '=' }))

    expect(within(calculator).getByLabelText('계산기 표시창')).toHaveTextContent('10')
  })

  it('shows both the current date and time in the taskbar', () => {
    vi.stubGlobal('fetch', vi.fn())
    render(<MemoryRouter><App /></MemoryRouter>)

    expect(screen.getByLabelText(/현재 날짜.+현재 시각/)).toBeInTheDocument()
  })

  it('keeps utility apps inside My Folder instead of on the desktop', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn())
    render(<MemoryRouter><App /></MemoryRouter>)

    const desktop = screen.getByRole('navigation', { name: '바탕화면 바로가기' })
    expect(within(desktop).queryByRole('button', { name: '메모장' })).not.toBeInTheDocument()
    expect(within(desktop).queryByRole('button', { name: '그림판' })).not.toBeInTheDocument()
    await user.click(within(desktop).getByRole('button', { name: '내 폴더' }))
    const folder = screen.getByRole('region', { name: '내 폴더' })
    expect(within(folder).getByRole('button', { name: '메모장' })).toBeInTheDocument()
    expect(within(folder).getByRole('button', { name: '그림판' })).toBeInTheDocument()
    expect(within(folder).getByRole('button', { name: '계산기' })).toBeInTheDocument()
    expect(within(folder).getByRole('button', { name: '지뢰찾기' })).toBeInTheDocument()
  })
})
