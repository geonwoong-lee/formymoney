import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { lazy, Suspense } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ScreenBoundary } from './ScreenBoundary'

const RELOADED_AT_KEY = 'very-rich:chunk-reload-at:v1'
const reload = vi.fn()
const missing = () => lazy(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module: /assets/Page-abc.js')))

beforeEach(() => {
  reload.mockClear()
  vi.stubGlobal('location', { ...window.location, reload })
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ScreenBoundary', () => {
  it('reloads the page once when a screen file is gone, as after a new release', async () => {
    const Missing = missing()
    render(<ScreenBoundary><Suspense fallback={<p>loading</p>}><Missing /></Suspense></ScreenBoundary>)

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    expect(window.sessionStorage.getItem(RELOADED_AT_KEY)).not.toBeNull()
  })

  it('does not reload again soon after, and shows a message with a reload button instead', async () => {
    window.sessionStorage.setItem(RELOADED_AT_KEY, String(Date.now() - 60_000))
    const Missing = missing()
    render(<ScreenBoundary><Suspense fallback={<p>loading</p>}><Missing /></Suspense></ScreenBoundary>)

    expect(await screen.findByRole('alert')).toHaveTextContent('화면을 불러오지 못했어요')
    expect(reload).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: '새로 고침' }))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('recovers when the visitor moves to another screen (a new key)', async () => {
    window.sessionStorage.setItem(RELOADED_AT_KEY, String(Date.now()))
    const Missing = missing()
    const { rerender } = render(<ScreenBoundary key="/a"><Suspense fallback={<p>loading</p>}><Missing /></Suspense></ScreenBoundary>)
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    rerender(<ScreenBoundary key="/b"><p>another screen</p></ScreenBoundary>)
    expect(screen.getByText('another screen')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renders its children when nothing fails', () => {
    render(<ScreenBoundary><p>fine</p></ScreenBoundary>)
    expect(screen.getByText('fine')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
