import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, getSavingsProducts } from './client'

afterEach(() => vi.unstubAllGlobals())

describe('API request errors', () => {
  it('keeps a cancelled request separate from a server connection failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError')))

    await expect(getSavingsProducts()).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('reports a real network failure as a server connection error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network failed')))

    await expect(getSavingsProducts()).rejects.toBeInstanceOf(ApiError)
    await expect(getSavingsProducts()).rejects.toThrow('서버에 연결할 수 없습니다.')
  })
})
