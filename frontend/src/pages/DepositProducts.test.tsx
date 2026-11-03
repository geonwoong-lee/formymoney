import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DepositProducts } from './DepositProducts'

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const product = (company: string, baseRate: string, baseAfterTax: number, maxRate: string | null = null, maxAfterTax: number | null = null) => ({
  company, productName: `${company} 정기예금`, rateType: '단리', baseRate, maxRate, baseAfterTax, maxAfterTax,
  joinWay: '', joinMember: '', joinLimit: '', specialConditions: '', maxLimit: null as number | null, overLimit: false, etcNote: '', maturityInterest: '',
})

function response(group: string, products: ReturnType<typeof product>[]) {
  return {
    amount: 10_000_000, months: 12, group, day: '2026-11-03', count: products.length,
    lowest: { ratePercent: '2.00', afterTax: 10_169_200 }, middle: { ratePercent: '3.00', afterTax: 10_253_800 }, highest: { ratePercent: '3.50', afterTax: 10_296_100 },
    products, notes: [`${group} 안내`, '금리 순서로 보여 줄 뿐 어느 상품도 권하지 않아요.'],
    sourceName: '금융감독원 금융상품 한눈에', sourceUrl: 'https://finlife.fss.or.kr/',
  }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('DepositProducts', () => {
  it('shows the range and each deposit worked out for my amount, and re-sorts and switches groups', async () => {
    const user = userEvent.setup()
    const many = Array.from({ length: 12 }, (_, index) => product(`은행${String(index + 1).padStart(2, '0')}`, '3.00', 10_200_000 - index))
    const fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      return Promise.resolve(respond(body.group === 'savings_bank'
        ? response('저축은행', [product('가저축은행', '4.00', 10_338_400)])
        : response('은행', [product('가은행', '3.00', 10_253_800, '3.50', 10_296_100), product('나은행', '3.50', 10_296_100), ...many])))
    })
    vi.stubGlobal('fetch', fetch)
    render(<DepositProducts amount={10_000_000} months={12} headingId="x" />)

    const summary = await screen.findByLabelText('기본금리로 받는 돈의 범위')
    expect(summary).toHaveTextContent('가장 적게10,169,200원연 2%')
    expect(summary).toHaveTextContent('가장 많이10,296,100원연 3.5%')
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({ amount: 10_000_000, months: 12, group: 'bank' })

    const list = screen.getByRole('list', { name: '은행 정기예금 목록' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(10)
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('나은행')
    expect(within(list).getAllByRole('listitem')[1]).toHaveTextContent('우대 조건을 다 채우면 3.5% → 세후 10,296,100원')
    expect(within(list).getAllByRole('listitem')[0]).not.toHaveTextContent('우대 조건')
    await user.click(screen.getByRole('button', { name: '4개 더 보기 (10/14)' }))
    expect(within(list).getAllByRole('listitem')).toHaveLength(14)

    await user.selectOptions(screen.getByLabelText('보는 순서'), 'best')
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('가은행')
    await user.selectOptions(screen.getByLabelText('보는 순서'), 'name')
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('가은행')
    expect(screen.getByText('금리 순서로 보여 줄 뿐 어느 상품도 권하지 않아요.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /금융상품 한눈에/ })).toHaveAttribute('href', 'https://finlife.fss.or.kr/')

    await user.click(screen.getByRole('radio', { name: '저축은행' }))
    expect(await screen.findByRole('list', { name: '저축은행 정기예금 목록' })).toHaveTextContent('가저축은행')
    expect(screen.getByText('저축은행 안내')).toBeInTheDocument()
  })

  it('shows the joining terms of each product as disclosed and flags an amount over the limit', async () => {
    const user = userEvent.setup()
    const strict = {
      ...product('가은행', '3.00', 10_253_800, '3.40', 10_287_640),
      joinWay: '인터넷,스마트폰', joinMember: '실명의 개인', joinLimit: '서민 전용', specialConditions: '1. 급여 이체 시 0.2%p\n2. 카드 사용 시 0.2%p',
      maxLimit: 5_000_000, overLimit: true, etcNote: '해당사항 없음', maturityInterest: '만기 후 1개월: 약정이율의 50%',
    }
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(respond(response('은행', [strict, product('나은행', '2.00', 10_169_200)])))))
    render(<DepositProducts amount={10_000_000} months={12} headingId="x" />)

    const list = await screen.findByRole('list', { name: '은행 정기예금 목록' })
    const [first, second] = within(list).getAllByRole('listitem')
    expect(first).toHaveTextContent('한도 500만 원: 내 금액이 넘어요')
    expect(first).toHaveTextContent('서민 전용')
    await user.click(within(first).getByText('가입 조건 보기'))
    const terms = within(first).getByRole('group')
    expect(terms).toHaveTextContent('우대 조건1. 급여 이체 시 0.2%p')
    expect(terms).toHaveTextContent('가입 방법인터넷, 스마트폰')
    expect(terms).toHaveTextContent('가입 한도500만 원까지')
    expect(terms).not.toHaveTextContent('그 밖의 안내')  // "해당사항 없음" is left out
    expect(within(second).queryByText('가입 조건 보기')).not.toBeInTheDocument()
    expect(second).not.toHaveTextContent('내 금액이 넘어요')
  })

  it('says so when nothing is collected or the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(respond({ ...response('은행', []), count: 0, lowest: null, middle: null, highest: null, day: null }))))
    render(<DepositProducts amount={10_000_000} months={24} headingId="x" />)
    expect(await screen.findByText('아직 모은 24개월 정기예금 공시 금리가 없어요.')).toBeInTheDocument()

    cleanup()
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(respond({ error: { code: 'x', message: 'x' } }, 503))))
    render(<DepositProducts amount={10_000_000} months={12} headingId="x" />)
    expect(await screen.findByText('공시 금리를 불러오지 못했어요. 잠시 후 다시 확인해 주세요.')).toBeInTheDocument()
  })
})
