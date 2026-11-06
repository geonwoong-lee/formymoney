import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { BusinessPage } from './BusinessPage'

afterEach(cleanup)

describe('BusinessPage', () => {
  it('explains the two business tools and links to them', () => {
    render(<MemoryRouter><BusinessPage /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: '기업·제휴용', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '우대조건 현황 보기' })).toHaveAttribute('href', '/condition-stats')
    expect(screen.getByRole('link', { name: '위젯 넣는 방법 보기' })).toHaveAttribute('href', '/widget')
  })
})
