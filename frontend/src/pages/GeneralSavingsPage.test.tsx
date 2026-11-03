import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EligibilityCheck } from '../components/EligibilityCheck'
import { ELIGIBILITY_KEY, loadEligibility, YOUTH_OFFICIAL_URL } from '../features/eligibility'
import { emptyDraft, saveDraft } from '../storage/draftStorage'
import { GeneralSavingsPage } from './GeneralSavingsPage'

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const product = (company: string, baseRate: string, baseAfterTax: number, reserveType = '정액적립식') => ({
  company, productCode: `${company}-P`, reserveType, productName: `${company} 적금`, rateType: '단리', baseRate, maxRate: null,
  baseAfterTax, maxAfterTax: null, joinWay: '', joinMember: '', joinLimit: '', specialConditions: '', maxLimit: null, overLimit: false, etcNote: '', maturityInterest: '',
})

function savingsResponse(group: string, products: ReturnType<typeof product>[]) {
  return {
    amount: 300_000, months: 12, group, day: '2026-11-03', count: products.length, principal: 3_600_000,
    lowest: { ratePercent: '2.00', afterTax: 3_660_000 }, middle: { ratePercent: '3.00', afterTax: 3_680_000 }, highest: { ratePercent: '4.00', afterTax: 3_700_000 },
    products, notes: ['금리 순서로 보여 줄 뿐 어느 상품도 권하지 않아요.'], sourceName: '금융감독원 금융상품 한눈에', sourceUrl: 'https://finlife.fss.or.kr/',
  }
}

const renderPage = () => render(<MemoryRouter><GeneralSavingsPage /></MemoryRouter>)

beforeEach(() => window.localStorage.clear())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('EligibilityCheck', () => {
  it('keeps the visitor’s own answer, never judges it, and points to the official page and the next step', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><EligibilityCheck /></MemoryRouter>)
    expect(screen.queryByRole('link', { name: /일반 적금 비교하기|내 조건 입력하기/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /서민금융진흥원 청년미래적금 안내/ })).toHaveAttribute('href', YOUTH_OFFICIAL_URL)
    expect(document.body).toHaveTextContent('이 사이트는 대상 여부를 판단하지 않으니')

    await user.click(screen.getByRole('radio', { name: '대상이 아니에요' }))
    expect(window.localStorage.getItem(ELIGIBILITY_KEY)).toBe('not_eligible')
    expect(screen.getByRole('link', { name: '일반 적금 비교하기' })).toHaveAttribute('href', '/general-savings')

    await user.click(screen.getByRole('radio', { name: '대상이에요' }))
    expect(screen.getByRole('link', { name: '내 조건 입력하기' })).toHaveAttribute('href', '/conditions')
    await user.click(screen.getByRole('radio', { name: '확인 중이에요' }))
    expect(screen.getByRole('link', { name: '일반 적금 비교하기' })).toBeInTheDocument()

    cleanup()
    render(<MemoryRouter><EligibilityCheck /></MemoryRouter>)
    expect(screen.getByRole('radio', { name: '확인 중이에요' })).toBeChecked()
    window.localStorage.setItem(ELIGIBILITY_KEY, 'something else')
    expect(loadEligibility()).toBeNull()
  })
})

describe('GeneralSavingsPage', () => {
  it('asks the server for the monthly amount, term and kind, and lists what it returns', async () => {
    const user = userEvent.setup()
    saveDraft({ ...emptyDraft, plan: { monthlyAmount: 300_000 } })
    const fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      return Promise.resolve(respond(body.group === 'savings_bank'
        ? savingsResponse('저축은행', [product('가저축은행', '4.00', 3_700_000, '자유적립식')])
        : savingsResponse('은행', [product('가은행', '3.00', 3_680_000), product('나은행', '2.00', 3_660_000)])))
    })
    vi.stubGlobal('fetch', fetch)
    renderPage()

    const list = await screen.findByRole('list', { name: '은행 적금 목록' })
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({ monthlyAmount: 300_000, months: 12, group: 'bank', reserve: 'all' })
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('가은행')
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('세후 3,680,000원')
    expect(document.body).toHaveTextContent('내가 넣는 원금은 3,600,000원이에요')
    expect(document.body).toHaveTextContent('정부기여금이 없고, 이자에 15.4% 세금이 붙어요')
    // Already on the general savings screen, so its own link is not offered again.
    expect(screen.queryByRole('link', { name: '일반 적금 비교하기' })).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('기간'), '24')
    await user.selectOptions(screen.getByLabelText('적립 방식'), 'free')
    await vi.waitFor(() => expect(JSON.parse(String(fetch.mock.calls.at(-1)?.[1]?.body))).toEqual({ monthlyAmount: 300_000, months: 24, group: 'bank', reserve: 'free' }))

    await user.click(screen.getByRole('radio', { name: '저축은행' }))
    const banks = await screen.findByRole('list', { name: '저축은행 적금 목록' })
    expect(within(banks).getByText('자유적립식')).toBeInTheDocument()
    // The same product can be starred and watched for rate moves.
    await user.click(within(banks).getByRole('button', { name: '☆ 관심' }))
    expect(JSON.parse(window.localStorage.getItem('very-rich:watch-products:v1') ?? '[]')).toEqual([
      { kind: 'saving', company: '가저축은행', productCode: '가저축은행-P', productName: '가저축은행 적금' },
    ])
  })

  it('does not ask for an amount outside the allowed range', async () => {
    const user = userEvent.setup()
    const fetch = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => Promise.resolve(respond(savingsResponse('은행', []))))
    vi.stubGlobal('fetch', fetch)
    renderPage()
    const amount = screen.getByLabelText('매달 넣을 돈(원)')
    await user.clear(amount)
    await user.type(amount, '5000')
    expect(await screen.findByRole('alert')).toHaveTextContent('10,000원부터 5,000,000원까지')
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(fetch.mock.calls.every(([, init]) => JSON.parse(String(init?.body)).monthlyAmount !== 5_000)).toBe(true)
  })
})
