import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

afterEach(() => {
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
    expect(await screen.findByText(/FastAPI와 SQLite 연결 완료/)).toBeInTheDocument()
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
})
