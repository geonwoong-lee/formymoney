import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StickyNote } from './StickyNote'

const show = (path = '/') => render(<MemoryRouter initialEntries={[path]}><StickyNote /></MemoryRouter>)

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('StickyNote', () => {
  it('lists the first-visit path in order, each step a link, and marks the screen the visitor is on', () => {
    show('/banks')

    const links = screen.getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/conditions', '/banks', '/my-savings', '/cashflow', '/maturity'])
    expect(screen.getByRole('list')).toHaveTextContent(/내 조건.*은행 비교.*내 적금.*납입 계획.*만기 후 계획/)
    expect(links.filter((link) => link.getAttribute('aria-current') === 'page').map((link) => link.getAttribute('href'))).toEqual(['/banks'])
  })

  it('shrinks to a stub when closed, remembers that, and opens again from the stub', async () => {
    const user = userEvent.setup()
    const first = show()
    await user.click(screen.getByRole('button', { name: '이용 순서 메모 닫기' }))

    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    expect(window.localStorage.getItem('very-rich:sticky-note-closed:v1')).toBe('1')
    first.unmount()

    show()
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()  // still closed on the next visit
    await user.click(screen.getByRole('button', { name: /이용 순서 메모 열기/ }))
    expect(screen.getByRole('complementary', { name: /이용 순서/ })).toBeInTheDocument()
    expect(window.localStorage.getItem('very-rich:sticky-note-closed:v1')).toBeNull()
  })

  it('still works for this visit when the browser refuses to store anything', async () => {
    const user = userEvent.setup()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('blocked') })
    show()

    await user.click(screen.getByRole('button', { name: '이용 순서 메모 닫기' }))
    expect(screen.getByRole('button', { name: /이용 순서 메모 열기/ })).toBeInTheDocument()
  })
})
