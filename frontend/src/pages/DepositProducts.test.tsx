import { MemoryRouter } from 'react-router-dom'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DepositProducts } from './DepositProducts'

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const product = (company: string, baseRate: string, baseAfterTax: number, maxRate: string | null = null, maxAfterTax: number | null = null) => ({
  company, productCode: `${company}-P`, reserveType: '', productName: `${company} 정기예금`, rateType: '단리', baseRate, maxRate, baseAfterTax, maxAfterTax,
  joinWay: '', joinMember: '', joinLimit: '', specialConditions: '', maxLimit: null as number | null, overLimit: false, etcNote: '', maturityInterest: '',
})

function response(group: string, products: ReturnType<typeof product>[]) {
  return {
    amount: 10_000_000, months: 12, group, day: '2026-11-03', count: products.length, principal: null,
    lowest: { ratePercent: '2.00', afterTax: 10_169_200 }, middle: { ratePercent: '3.00', afterTax: 10_253_800 }, highest: { ratePercent: '3.50', afterTax: 10_296_100 },
    products, notes: [`${group} 안내`, '금리 순서로 보여 줄 뿐 어느 상품도 권하지 않아요.'],
    sourceName: '금융감독원 금융상품 한눈에', sourceUrl: 'https://finlife.fss.or.kr/',
  }
}

afterEach(() => {
  window.localStorage.clear()
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
    render(<MemoryRouter><DepositProducts amount={10_000_000} months={12} headingId="x" /></MemoryRouter>)

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
    render(<MemoryRouter><DepositProducts amount={10_000_000} months={12} headingId="x" /></MemoryRouter>)

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

    // Starring keeps the product in this browser for the rate alerts.
    await user.click(within(first).getByRole('button', { name: '☆ 관심' }))
    expect(within(first).getByRole('button', { name: '★ 관심 상품' })).toHaveAttribute('aria-pressed', 'true')
    expect(JSON.parse(window.localStorage.getItem('very-rich:watch-products:v1') ?? '[]')).toEqual([
      { kind: 'deposit', company: '가은행', productCode: '가은행-P', productName: '가은행 정기예금' },
    ])
    await user.click(within(first).getByRole('button', { name: '★ 관심 상품' }))
    expect(JSON.parse(window.localStorage.getItem('very-rich:watch-products:v1') ?? '[]')).toEqual([])
    expect(second).not.toHaveTextContent('내 금액이 넘어요')
  })

  it('says so when nothing is collected or the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(respond({ ...response('은행', []), count: 0, lowest: null, middle: null, highest: null, day: null }))))
    render(<MemoryRouter><DepositProducts amount={10_000_000} months={24} headingId="x" /></MemoryRouter>)
    expect(await screen.findByText('아직 모은 24개월 정기예금 공시 금리가 없어요.')).toBeInTheDocument()

    cleanup()
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(respond({ error: { code: 'x', message: 'x' } }, 503))))
    render(<MemoryRouter><DepositProducts amount={10_000_000} months={12} headingId="x" /></MemoryRouter>)
    expect(await screen.findByText('공시 금리를 불러오지 못했어요. 잠시 후 다시 확인해 주세요.')).toBeInTheDocument()
  })

  it('narrows the list to the companies whose name has what I typed, and brings the full range back when I clear it', async () => {
    const user = userEvent.setup()
    const everyone = [product('우리은행', '3.00', 10_253_800), product('국민은행', '3.40', 10_287_000), product('KB저축', '3.10', 10_262_000), ...Array.from({ length: 12 }, (_, index) => product(`다른은행${index}`, '2.50', 10_200_000 - index))]
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(respond(response('은행', everyone)))))
    render(<MemoryRouter><DepositProducts amount={10_000_000} months={12} headingId="x" /></MemoryRouter>)
    await screen.findByLabelText('기본금리로 받는 돈의 범위')

    const search = screen.getByLabelText('은행 이름으로 찾기')
    await user.type(search, '우리')
    const list = screen.getByRole('list', { name: '은행 정기예금 목록' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    expect(within(list).getByRole('listitem')).toHaveTextContent('우리은행')
    expect(screen.getByRole('status')).toHaveTextContent('전체 15개 중 ‘우리’이(가) 들어간 금융회사의 정기예금 1개를 보여 드려요')
    expect(screen.queryByLabelText('기본금리로 받는 돈의 범위')).not.toBeInTheDocument()  // the range was for everyone, so it steps aside

    // KB is how people say 국민: both the disclosed 국민은행 and KB저축 turn up, and the line says why
    await user.clear(search)
    await user.type(search, 'kb')
    const aliased = within(screen.getByRole('list', { name: '은행 정기예금 목록' })).getAllByRole('listitem')
    expect(aliased.map((item) => item.textContent)).toEqual([expect.stringContaining('국민은행'), expect.stringContaining('KB저축')])
    expect(screen.getByRole('status')).toHaveTextContent('‘kb’(국민·케이비 포함)이(가) 들어간 금융회사의 정기예금 2개')

    await user.clear(search)
    await user.type(search, '없는이름')
    expect(screen.getByRole('status')).toHaveTextContent('‘없는이름’이(가) 들어간 금융회사의 정기예금이 없어요')
    expect(within(screen.getByRole('list', { name: '은행 정기예금 목록' })).queryAllByRole('listitem')).toHaveLength(0)

    await user.clear(search)
    expect(screen.getByLabelText('기본금리로 받는 돈의 범위')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: '은행 정기예금 목록' })).getAllByRole('listitem')).toHaveLength(10)
  })

  it('offers the loaded companies as suggestions and forgets the name when I switch to savings banks', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(respond(
      JSON.parse(String(init?.body)).group === 'savings_bank' ? response('저축은행', [product('가저축은행', '4.00', 10_338_400)]) : response('은행', [product('우리은행', '3.00', 10_253_800), product('국민은행', '3.40', 10_287_000)]),
    ))))
    const { container } = render(<MemoryRouter><DepositProducts amount={10_000_000} months={12} headingId="x" /></MemoryRouter>)
    await screen.findByLabelText('기본금리로 받는 돈의 범위')

    expect([...container.querySelectorAll('datalist option')].map((option) => option.getAttribute('value'))).toEqual(['국민은행', '우리은행'])
    await user.type(screen.getByLabelText('은행 이름으로 찾기'), '우리')
    await user.click(screen.getByRole('radio', { name: '저축은행' }))

    expect(screen.getByLabelText('은행 이름으로 찾기')).toHaveValue('')
    expect(await screen.findByRole('list', { name: '저축은행 정기예금 목록' })).toHaveTextContent('가저축은행')
  })
})
