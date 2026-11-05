import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EmbedSavingsPage } from './EmbedSavingsPage'

const estimate = (monthlyAmount: number, contributionType: string) => ({
  monthlyAmount, termMonths: 36, contributionType, contributionRate: 6, principal: monthlyAmount * 36,
  banks: [
    { bankCode: 'kb', bankName: 'KB국민은행', productName: 'KB', baseRate: 5, maximumRate: 8, maturityAtBaseRate: 20_550_750, maturityAtMaximumRate: 21_383_250, sourceUrl: 'https://example.com', sourceDate: '2026-10-13' },
    { bankCode: 'busan', bankName: '광주은행', productName: 'KJB', baseRate: 5, maximumRate: 7, maturityAtBaseRate: 20_550_751, maturityAtMaximumRate: 21_105_750, sourceUrl: 'https://example.com', sourceDate: '2026-10-13' },
  ],
  policySourceUrl: 'https://example.com/policy', policySourceDate: '2026-10-06',
  disclaimer: '공시 금리로 계산한 세전 예상치입니다. 특정 은행·상품을 추천하지 않습니다.',
})

function stub() {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = new URL(String(input))
    return Promise.resolve(new Response(JSON.stringify(estimate(Number(url.searchParams.get('monthlyAmount')), url.searchParams.get('contributionType') ?? '')),
      { status: 200, headers: { 'Content-Type': 'application/json' } }))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
  localStorage.clear()
})

describe('EmbedSavingsPage', () => {
  it('starts from the values in the address and shows the range with the disclaimer', async () => {
    window.history.replaceState(null, '', '/embed/savings?amount=300000&type=preferred')
    const fetchMock = stub()
    render(<EmbedSavingsPage />)

    expect(await screen.findByText('20,550,750원')).toBeInTheDocument()
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/monthlyAmount=300000&contributionType=preferred$/)
    expect(screen.getByRole('combobox', { name: '정부기여금' })).toHaveValue('preferred')
    expect(screen.getByText(/추천하지 않습니다/)).toBeInTheDocument()
    // 순위가 아니라 은행 이름 순으로 보인다.
    expect(screen.getAllByRole('rowheader').map((cell) => cell.firstChild?.textContent)).toEqual(['광주은행', 'KB국민은행'])
    expect(screen.getByRole('link', { name: /내 우대조건으로 예상해 보기/ })).toHaveAttribute('target', '_blank')
    // 위젯은 방문자 입력을 저장하지 않는다.
    expect(localStorage.length).toBe(0)
  })

  it('ignores bad start values and blocks amounts outside the rules', async () => {
    window.history.replaceState(null, '', '/embed/savings?amount=12345&type=gold')
    const fetchMock = stub()
    const user = userEvent.setup()
    render(<EmbedSavingsPage />)

    await screen.findByText('20,550,750원')
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/monthlyAmount=500000&contributionType=general$/)
    const input = screen.getByRole('textbox', { name: '월 납입액' })
    await user.clear(input)
    await user.type(input, '1500')
    expect(screen.getByRole('alert')).toHaveTextContent('1,000원 단위')
    expect(screen.getByRole('button', { name: '계산' })).toBeDisabled()
    expect(screen.queryByText('20,550,750원')).not.toBeInTheDocument()
  })

  it('recalculates when the contribution type changes', async () => {
    const fetchMock = stub()
    const user = userEvent.setup()
    render(<EmbedSavingsPage />)
    await screen.findByText('20,550,750원')

    await user.selectOptions(screen.getByRole('combobox', { name: '정부기여금' }), 'none')
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(String(fetchMock.mock.calls[1][0])).toMatch(/contributionType=none$/)
  })
})

describe('EmbedSavingsPage failed recalculation', () => {
  it('does not leave the previous result next to the new input when recalculation fails', async () => {
    let calls = 0
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      calls += 1
      if (calls > 1) return Promise.resolve(new Response(JSON.stringify({ detail: '잠시 후 다시 불러 주세요.' }), { status: 429, headers: { 'Content-Type': 'application/json' } }))
      const url = new URL(String(input))
      return Promise.resolve(new Response(JSON.stringify(estimate(Number(url.searchParams.get('monthlyAmount')), 'general')), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    }))
    const user = userEvent.setup()
    render(<EmbedSavingsPage />)
    await screen.findByText('20,550,750원')

    await user.selectOptions(screen.getByRole('combobox', { name: '정부기여금' }), 'preferred')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('20,550,750원')).not.toBeInTheDocument()
  })
})

describe('EmbedSavingsPage editing while a calculation is running', () => {
  it('lets the visitor calculate again after changing the amount mid-request', async () => {
    let release: (value: Response) => void = () => {}
    let calls = 0
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      calls += 1
      const url = new URL(String(input))
      const body = JSON.stringify(estimate(Number(url.searchParams.get('monthlyAmount')), 'general'))
      if (calls === 1) return new Promise<Response>((resolve) => { release = resolve })
      return Promise.resolve(new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } }))
    }))
    const user = userEvent.setup()
    render(<EmbedSavingsPage />)

    const input = screen.getByRole('textbox', { name: '월 납입액' })
    await user.clear(input)
    await user.type(input, '300000')
    const button = screen.getByRole('button', { name: '계산' })
    expect(button).toBeEnabled()
    await user.click(button)
    expect(await screen.findByText('20,550,750원')).toBeInTheDocument()
    await act(async () => {
      release(new Response(JSON.stringify(estimate(500_000, 'general')), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    // 늦게 온 첫 응답(50만 원)이 두 번째 결과(30만 원)를 덮어쓰지 않는다.
    expect(screen.getByText(/넣는 돈 10,800,000원/)).toBeInTheDocument()
    expect(screen.queryByText(/넣는 돈 18,000,000원/)).not.toBeInTheDocument()
  })
})
