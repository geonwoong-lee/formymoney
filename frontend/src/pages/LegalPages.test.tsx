import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PrivacyPage, ServiceTermsPage } from './LegalPages'

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

describe('legal pages', () => {
  it('says what the privacy policy covers: browser-only input, no stored password, what is sent to the AI helper, and how to delete', () => {
    render(<MemoryRouter><PrivacyPage /></MemoryRouter>)

    expect(screen.getByRole('heading', { level: 1, name: '개인정보 처리방침' })).toBeInTheDocument()
    expect(screen.getByText(/이 브라우저의 저장소에만/)).toBeInTheDocument()
    expect(screen.getByText(/비밀번호는 서비스의 서버와 데이터베이스에 저장하지 않아요/)).toBeInTheDocument()
    expect(screen.getByText(/서버로도 보내지 않아요/)).toBeInTheDocument()
    expect(screen.getAllByText(/OpenAI/).length).toBeGreaterThan(0)
    expect(screen.getByText(/저장하지 않고 기록에도 남기지 않아요/)).toBeInTheDocument()
    expect(screen.getByText(/내 정보 화면에서 하나씩 또는 모두 지울 수 있어요/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '이용약관 보기' })).toHaveAttribute('href', '/service-terms')
  })

  it('says in the terms that results are estimates, AI can be wrong, and nothing is advice', () => {
    render(<MemoryRouter><ServiceTermsPage /></MemoryRouter>)

    expect(screen.getByRole('heading', { level: 1, name: '이용약관' })).toBeInTheDocument()
    expect(screen.getByText(/참고용 도구/)).toBeInTheDocument()
    expect(screen.getByText(/예상 결과/)).toBeInTheDocument()
    expect(screen.getByText(/틀릴 수 있어요/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '개인정보 처리방침 보기' })).toHaveAttribute('href', '/privacy')
  })

  it('tells where the contact will be until an address is set, and shows the address once it is', () => {
    render(<MemoryRouter><PrivacyPage /></MemoryRouter>)
    expect(screen.getByText(/공개할 때 이 자리에 안내합니다/)).toBeInTheDocument()
  })
})
