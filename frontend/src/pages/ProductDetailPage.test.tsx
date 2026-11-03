import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProductDetailPage } from './ProductDetailPage'

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const point = (day: string, base: string) => ({ day, baseRate: base, maxRate: String(Number(base) + 0.5) })
const detail = (history: ReturnType<typeof point>[]) => ({
  kind: 'saving', company: '가은행', productCode: 'S1', productName: '가 적금', group: '은행', firstDay: history[0].day, lastDay: history[history.length - 1].day,
  daysCollected: history.length,
  terms: { joinWay: '앱', joinMember: '만 19세 이상', joinLimit: '제한 없음', specialConditions: '급여 이체 시 0.5%p', maxLimit: 500_000, etcNote: '', maturityInterest: '' },
  options: [
    { termMonths: 12, rateType: '단리', reserveType: '자유적립식', disclosedMonth: '202610', history },
    { termMonths: 24, rateType: '단리', reserveType: '자유적립식', disclosedMonth: '202610', history: [point('2026-11-03', '3.40')] },
  ],
  notes: ['변화를 보여 줄 뿐 어떤 상품도 권하지 않아요.'], sourceName: '금융감독원 금융상품 한눈에', sourceUrl: 'https://finlife.fss.or.kr/',
})
const renderAt = (search: string) => render(<MemoryRouter initialEntries={[`/product${search}`]}><ProductDetailPage /></MemoryRouter>)

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ProductDetailPage', () => {
  it('asks for the product in the link, draws the rate path and lists the terms', async () => {
    const user = userEvent.setup()
    const fetch = vi.fn(() => Promise.resolve(respond(detail([point('2026-11-01', '3.00'), point('2026-11-02', '3.10'), point('2026-11-03', '3.25')]))))
    vi.stubGlobal('fetch', fetch)
    renderAt('?kind=saving&company=%EA%B0%80%EC%9D%80%ED%96%89&code=S1')

    expect(await screen.findByRole('heading', { name: '가은행 가 적금' })).toBeInTheDocument()
    const called = String((fetch.mock.calls[0] as unknown as [string])[0])
    expect(called).toContain('kind=saving')
    expect(called).toContain('code=S1')
    expect(screen.getByRole('img', { name: /기본금리 3%에서 3.25%까지, 3일치/ })).toBeInTheDocument()
    expect(document.body).toHaveTextContent('모은 기간 동안 +0.25%p 바뀌었어요')
    expect(document.body).toHaveTextContent('급여 이체 시 0.5%p')
    expect(document.body).toHaveTextContent('가입 한도')
    expect(screen.getByRole('link', { name: /금융감독원 금융상품 한눈에/ })).toHaveAttribute('href', 'https://finlife.fss.or.kr/')

    await user.selectOptions(screen.getByLabelText('기간·방식'), '1')
    expect(document.body).toHaveTextContent('아직 하루치만 모아서 변화는 볼 수 없어요')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('says so when the product has no record, and asks to come from the list when the link is bare', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(respond({ error: { message: '없음' } }, 404))))
    renderAt('?kind=saving&company=x&code=y')
    expect(await screen.findByText(/공시 기록을 찾지 못했어요/)).toBeInTheDocument()

    cleanup()
    renderAt('')
    expect(screen.getByText(/목록에서 상품의 “상세”를 눌러/)).toBeInTheDocument()
  })
})
