import { describe, expect, it } from 'vitest'
import { clearAuthSession, loadAuthSession, saveAuthSession } from './authStorage'

describe('authStorage', () => {
  it('stores tokens without storing a password', () => {
    const storage = window.localStorage
    clearAuthSession(storage)
    saveAuthSession({
      user: { id: 'user-1', email: 'user@example.com', displayName: '사용자', createdAt: null },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
      tokenType: 'bearer',
      needsEmailConfirmation: false,
    }, storage)

    const raw = storage.getItem('very-rich:auth:v1') ?? ''
    expect(loadAuthSession(storage)?.accessToken).toBe('access-token')
    expect(raw).not.toContain('password')
  })

  it('does not store a signup response without a session', () => {
    const stored = saveAuthSession({
      user: { id: 'user-1', email: 'user@example.com', displayName: null, createdAt: null },
      accessToken: null,
      refreshToken: null,
      expiresIn: null,
      tokenType: 'bearer',
      needsEmailConfirmation: true,
    })

    expect(stored).toBe(false)
  })
})
