import { cleanup, render, screen } from '@testing-library/react'
import { lazy, Suspense } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ScreenBoundary } from './ScreenBoundary'

beforeEach(() => {
  // Pretend the page was just reloaded, so the boundary shows its message instead of reloading again.
  window.sessionStorage.setItem('very-rich:chunk-reload-at:v1', String(Date.now()))
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
  vi.restoreAllMocks()
})

describe('ScreenBoundary', () => {
  it('shows a message and a reload button when a screen file cannot be loaded', async () => {
    const Missing = lazy(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module: /assets/Page-abc.js')))
    render(<ScreenBoundary><Suspense fallback={<p>loading</p>}><Missing /></Suspense></ScreenBoundary>)

    expect(await screen.findByRole('alert')).toHaveTextContent('화면을 불러오지 못했어요')
    expect(screen.getByRole('button', { name: '새로 고침' })).toBeInTheDocument()
  })

  it('renders its children when nothing fails', () => {
    render(<ScreenBoundary><p>fine</p></ScreenBoundary>)
    expect(screen.getByText('fine')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
