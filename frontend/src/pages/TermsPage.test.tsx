import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { GLOSSARY } from '../features/glossary'
import { TermsPage } from './TermsPage'

afterEach(cleanup)

describe('TermsPage', () => {
  it('lists every term with where it shows up, and narrows by what is typed', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><TermsPage /></MemoryRouter>)
    expect(document.querySelectorAll('.glossary__item')).toHaveLength(GLOSSARY.length)

    await user.type(screen.getByLabelText('찾을 말'), '보증')
    const items = Array.from(document.querySelectorAll('.glossary__item'))
    expect(items.length).toBeGreaterThan(0)
    expect(items.length).toBeLessThan(GLOSSARY.length)
    expect(within(items[0] as HTMLElement).getByText(/이 사이트에서는/)).toBeInTheDocument()

    await user.clear(screen.getByLabelText('찾을 말'))
    await user.type(screen.getByLabelText('찾을 말'), 'zzzz')
    expect(screen.getByText('맞는 말이 없어요. 다른 말로 찾아 보세요.')).toBeInTheDocument()
  })

  it('has unique anchors and only links to screens that exist', () => {
    const slugs = GLOSSARY.map((term) => term.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    const screens = ['/conditions', '/general-savings', '/maturity', '/rent-loans']
    for (const term of GLOSSARY) if (term.link) expect(screens).toContain(term.link.to)
  })
})
