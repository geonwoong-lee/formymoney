import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthPage } from './AuthPage'
import { clearAuthSession, loadAuthSession } from '../storage/authStorage'

afterEach(() => {
  cleanup()
  clearAuthSession()
  vi.unstubAllGlobals()
})

describe('AuthPage', () => {
  it('logs in through FastAPI and stores only the returned session', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        user: { id: 'user-1', email: 'user@example.com', displayName: '사용자', createdAt: null },
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresIn: 3600,
        tokenType: 'bearer',
        needsEmailConfirmation: false,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<MemoryRouter><AuthPage /></MemoryRouter>)
    await user.type(screen.getByLabelText('이메일'), 'user@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'safe-password')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(loadAuthSession()?.accessToken).toBe('test-access-token')
    expect(window.localStorage.getItem('very-rich:auth:v1')).not.toContain('safe-password')
  })
})

describe('signed-in shortcut', () => {
  it('sends a signed-in visitor from the login page to the my page', () => {
    window.localStorage.setItem('very-rich:auth:v1', JSON.stringify({
      accessToken: 'token', refreshToken: null, expiresAt: Date.now() + 60_000,
    }))

    render(
      <MemoryRouter initialEntries={['/auth']}>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/me" element={<p>내 정보 화면</p>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('내 정보 화면')).toBeInTheDocument()
  })

  it('shows the login page when the saved session has expired', () => {
    window.localStorage.setItem('very-rich:auth:v1', JSON.stringify({
      accessToken: 'token', refreshToken: null, expiresAt: Date.now() - 1_000,
    }))

    render(<MemoryRouter initialEntries={['/auth']}><AuthPage /></MemoryRouter>)

    expect(screen.getByRole('heading', { name: '로그인' })).toBeInTheDocument()
  })
})
