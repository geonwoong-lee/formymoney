import type { AuthSessionResponse } from '../api/client'

export const AUTH_STORAGE_KEY = 'very-rich:auth:v1'

export interface StoredAuthSession {
  accessToken: string
  refreshToken: string | null
  expiresAt: number | null
}

export function saveAuthSession(
  session: AuthSessionResponse,
  storage: Storage = window.localStorage,
): boolean {
  if (!session.accessToken) return false
  const expiresAt = session.expiresIn ? Date.now() + session.expiresIn * 1000 : null
  storage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt,
    } satisfies StoredAuthSession),
  )
  return true
}

export function loadAuthSession(storage: Storage = window.localStorage): StoredAuthSession | null {
  const raw = storage.getItem(AUTH_STORAGE_KEY)
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<StoredAuthSession>
    if (typeof value.accessToken !== 'string') throw new Error('invalid session')
    return {
      accessToken: value.accessToken,
      refreshToken: typeof value.refreshToken === 'string' ? value.refreshToken : null,
      expiresAt: typeof value.expiresAt === 'number' ? value.expiresAt : null,
    }
  } catch {
    storage.removeItem(AUTH_STORAGE_KEY)
    return null
  }
}

export function clearAuthSession(storage: Storage = window.localStorage) {
  storage.removeItem(AUTH_STORAGE_KEY)
}
