import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAuthSession } from '../storage/authStorage'
import { HomePage } from './HomePage'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    JSON.stringify({ status: 'ok', app: 'Very Rich?', database: 'ok', referenceKey: 'ready' }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )))
})

afterEach(() => {
  cleanup()
  clearAuthSession()
  vi.unstubAllGlobals()
})

describe('HomePage account link', () => {
  it('offers login and sign-up to a visitor', () => {
    render(<MemoryRouter><HomePage /></MemoryRouter>)

    expect(screen.getByRole('link', { name: '로그인 · 회원가입' })).toHaveAttribute('href', '/auth')
    expect(screen.queryByRole('link', { name: '내 정보 보기' })).not.toBeInTheDocument()
  })

  it('links a signed-in user straight to the my page', () => {
    window.localStorage.setItem('very-rich:auth:v1', JSON.stringify({
      accessToken: 'token', refreshToken: null, expiresAt: Date.now() + 60_000,
    }))

    render(<MemoryRouter><HomePage /></MemoryRouter>)

    expect(screen.getByRole('link', { name: '내 정보 보기' })).toHaveAttribute('href', '/me')
    expect(screen.queryByRole('link', { name: '로그인 · 회원가입' })).not.toBeInTheDocument()
  })
})
