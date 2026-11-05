import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { WidgetGuidePage } from './WidgetGuidePage'

afterEach(cleanup)

describe('WidgetGuidePage', () => {
  it('gives the iframe code for this site, a live preview and the API address', () => {
    render(<MemoryRouter><WidgetGuidePage /></MemoryRouter>)

    expect(document.body.textContent).toContain(`<iframe src="${window.location.origin}/embed/savings?amount=300000&type=general"`)
    expect(screen.getByTitle('위젯 미리보기')).toHaveAttribute('src', '/embed/savings?amount=300000&type=general')
    expect(screen.getByText(/\/api\/v1\/public\/savings-estimate\?monthlyAmount=300000/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '코드 복사' })).toHaveLength(2)
  })
})
