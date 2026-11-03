import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RentLoansPage } from './RentLoansPage'

const row = (name: string, extra: Record<string, unknown> = {}) => ({
  company: '우리은행', productCode: name, productName: name, repayType: '만기일시상환방식', rateType: '변동금리', rateMin: '3.50', rateMax: '4.50',
  monthlyLabel: '월 이자', monthlyMin: 291_666, monthlyMax: 375_000, totalInterestMin: 7_000_000, totalInterestMax: 9_000_000,
  loanLimit: '최대 2억원', earlyRepayFee: '면제', delayRate: '+3%', joinWay: '영업점', disclosedMonth: '202610', ...extra,
})
const body = (count: number, products = [row('A 전세론')]) => ({
  principal: 100_000_000, months: 24, group: '은행', day: '2026-11-03', count, products,
  notes: ['금리는 공시된 가장 낮은 금리와 가장 높은 금리예요.'], sourceName: '금융감독원 금융상품 한눈에', sourceUrl: 'https://finlife.fss.or.kr/',
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('RentLoansPage', () => {
  it('asks the server for the amount and term and shows both ends of the rate and the cost', async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify(body(1)), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    vi.stubGlobal('fetch', fetch)
    render(<MemoryRouter><RentLoansPage /></MemoryRouter>)

    expect(await screen.findByText('A 전세론', { exact: false })).toBeInTheDocument()
    expect(JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({
      principal: 100_000_000, months: 24, group: 'bank', repay: 'all', rateType: 'all',
    })
    expect(screen.getByText(/연 3.50% ~ 4.50%/)).toBeInTheDocument()
    expect(screen.getByText('291,666원 ~ 375,000원')).toBeInTheDocument()
    expect(screen.getByText('7,000,000원 ~ 9,000,000원')).toBeInTheDocument()
    expect(screen.getByText(/총이자가 적은 순서/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /금융감독원 금융상품 한눈에/ })).toHaveAttribute('href', 'https://finlife.fss.or.kr/')
  })

  it('sends the chosen repayment and rate type, and says so when nothing matches or the data cannot load', async () => {
    const user = userEvent.setup()
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(body(1)), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(body(0, [])), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValue(new Response('{}', { status: 503 }))
    vi.stubGlobal('fetch', fetch)
    render(<MemoryRouter><RentLoansPage /></MemoryRouter>)
    await screen.findByText('A 전세론', { exact: false })

    await user.selectOptions(screen.getByLabelText('갚는 방식'), 'instalment')
    expect(await screen.findByText(/고른 조건에 맞는 공시 대출이 없어요/)).toBeInTheDocument()
    expect(JSON.parse(String((fetch.mock.calls[1] as unknown as [string, RequestInit])[1].body)).repay).toBe('instalment')

    await user.selectOptions(screen.getByLabelText('금리 방식'), 'fixed')
    expect(await screen.findByText(/공시 금리를 불러오지 못했어요/)).toBeInTheDocument()
  })

  it('does not ask the server for an amount or term out of range', async () => {
    const user = userEvent.setup()
    const fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify(body(0, [])), { status: 200 })))
    vi.stubGlobal('fetch', fetch)
    render(<MemoryRouter><RentLoansPage /></MemoryRouter>)
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))

    await user.clear(screen.getByLabelText('기간(개월)'))
    await user.type(screen.getByLabelText('기간(개월)'), '600')
    expect(screen.getByRole('alert')).toHaveTextContent('기간은 6~120개월')
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
