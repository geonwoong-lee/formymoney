import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
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
