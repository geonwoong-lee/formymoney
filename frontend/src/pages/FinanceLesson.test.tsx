import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BankFinancialsSection } from '../components/BankFinancials'
import { formatKrwExact, formatKrwLarge } from '../features/krw'
import { FinanceLesson } from './FinanceLesson'

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
})

function financials(bankCode: string, corpName: string, overrides: Record<string, unknown> = {}) {
  const item = (key: string, label: string, current: string | null, previous: string | null, changePercent: string | null) => ({ key, label, current, previous, changePercent })
  return {
    bankCode, corpName, year: 2025, statement: '별도재무제표', periodEnd: '2025.12.31',
    items: [
      item('assets', '자산총계', '563592553000000', '543596383000000', '3.68'),
      item('liabilities', '부채총계', '524880638000000', '506250190000000', '3.68'),
      item('equity', '자본총계', '38711915000000', '37346193000000', '3.66'),
      item('deposits', '예수부채(고객이 맡긴 예금)', '423627466000000', '406134828000000', '4.31'),
      item('net_interest', '순이자손익', '9829730000000', '9589760000000', '2.50'),
      item('net_income', '당기순이익', '4224016000000', null, null),
    ],
    ratios: { equityToAssets: '6.87', depositsToLiabilities: '80.71', netIncomeToAssets: '0.75' },
    peers: { equityToAssets: { count: 11, min: '5.90', minBank: '하나은행', max: '8.83', maxBank: '카카오뱅크' } },
    balanced: true,
    statements: {
      balanceSheet: {
        assets: { label: '자산총계', total: '563592553000000', lines: [
          { key: 'fvtpl_assets', label: '당기손익-공정가치측정금융자산', amount: '22458493000000' },
          { key: null, label: '그 밖의 자산(대출채권·현금 등)', amount: '541134060000000' },
        ] },
        liabilities: { label: '부채총계', total: '524880638000000', lines: [
          { key: 'deposits', label: '예수부채(고객이 맡긴 예금)', amount: '423627466000000' },
          { key: null, label: '그 밖의 부채(은행이 낸 채권·빌린 돈 등)', amount: '101253172000000' },
        ] },
        equity: { label: '자본총계', total: '38711915000000', lines: [{ key: 'capital', label: '자본금', amount: '2021896000000' }] },
      },
      incomeStatement: [
        { key: 'interest_income', label: '이자수익', amount: '20187292000000' },
        { key: 'net_interest', label: '순이자손익', amount: '9829730000000' },
        { key: 'net_income', label: '당기순이익', amount: '4224016000000' },
      ],
    },
    sourceName: '금융감독원 전자공시시스템(DART) 사업보고서',
    sourceUrl: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260814002787',
    fetchedAt: '2026-11-03T01:02:49Z',
    ...overrides,
  }
}

// Lesson sentences wrap numbers in <b>, so match the whole paragraph's text.
const paragraph = (pattern: RegExp) => screen.getByText((_, element) => element?.tagName === 'P' && pattern.test(element.textContent ?? ''))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('formatKrwLarge', () => {
  it('reads large won amounts in 조 and 억', () => {
    expect(formatKrwLarge('563592553000000')).toBe('563조 5,926억 원')
    expect(formatKrwLarge('4224016000000')).toBe('4조 2,240억 원')
    expect(formatKrwLarge('480280000000')).toBe('4,803억 원')
    expect(formatKrwLarge('2000000000000')).toBe('2조 원')
    expect(formatKrwLarge('-125000000000')).toBe('−1,250억 원')
    expect(formatKrwLarge('9500')).toBe('9,500원')
    expect(formatKrwLarge(null)).toBe('–')
  })
})

describe('formatKrwExact', () => {
  it('keeps limits exact in 억 and 만', () => {
    expect(formatKrwExact(1_000_000_000)).toBe('10억 원')
    expect(formatKrwExact(150_000_000)).toBe('1억 5,000만 원')
    expect(formatKrwExact(5_000_000)).toBe('500만 원')
    expect(formatKrwExact(12_345)).toBe('12,345원')
  })
})

describe('FinanceLesson', () => {
  it('walks through the chosen bank with its real numbers and switches banks', async () => {
    const fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/dart/banks')) return Promise.resolve(respond({ banks: [{ bankCode: 'kakao', corpName: '카카오뱅크' }, { bankCode: 'kb', corpName: '국민은행' }] }))
      if (url.includes('/banks/kakao/')) return Promise.resolve(respond(financials('kakao', '카카오뱅크', { balanced: false })))
      return Promise.resolve(respond(financials('kb', '국민은행')))
    })
    vi.stubGlobal('fetch', fetch)
    render(<MemoryRouter><FinanceLesson /></MemoryRouter>)

    expect(await screen.findByText(/국민은행이 2025년 말에 가진 것/)).toBeInTheDocument()
    expect(paragraph(/국민은행이 2025년 말에 가진 것\(자산\)은 563조 5,926억 원이에요/)).toBeInTheDocument()
    expect(screen.getByLabelText('예시로 볼 은행')).toHaveValue('kb')

    // The statements come first, drawn like the printed ones, then the explanation.
    const assets = screen.getByRole('table', { name: '자산' })
    expect(within(assets).getByRole('row', { name: /그 밖의 자산\(대출채권·현금 등\)/ })).toHaveTextContent('541조 1,341억 원')
    const right = screen.getByRole('table', { name: '부채와 자본' })
    expect(within(right).getAllByRole('rowgroup').map((group) => group.querySelector('th')?.textContent)).toEqual(['부채', '자본'])
    expect(within(right).getByRole('row', { name: /예수부채/ })).toHaveTextContent('423조 6,275억 원')
    expect(screen.getByText('국민은행 · 2025.12.31 기준')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: '손익계산서' })).toHaveTextContent('순이자손익9조 8,297억 원')
    const sheet = screen.getByText('재무상태표', { selector: 'figcaption b' })
    expect(sheet.compareDocumentPosition(screen.getByText('1. 위의 두 표가 재무제표예요')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText(/부채와 자본을 더하면 자산과 똑같아요/)).toBeInTheDocument()
    expect(paragraph(/부채 전체의 80.71%예요/)).toBeInTheDocument()
    expect(screen.getByText(/비교해 보면/)).toHaveTextContent('가장 낮은 곳 하나은행 5.90%, 가장 높은 곳 카카오뱅크 8.83%')
    expect(screen.getByText(/BIS 자기자본비율/)).toBeInTheDocument()
    expect(paragraph(/국민은행은 4조 2,240억 원을 남겼고, 한 해 전보다 – 바뀌었어요/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /DART\) 사업보고서/ })).toHaveAttribute('href', 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260814002787')
    expect(screen.getByRole('table', { name: /주요 숫자/ })).toHaveTextContent('+2.50%')
    expect(document.body).not.toHaveTextContent(/안전합니다|위험합니다|추천/)

    await userEvent.selectOptions(screen.getByLabelText('예시로 볼 은행'), 'kakao')
    expect(await screen.findByText(/카카오뱅크가 2025년 말에/)).toBeInTheDocument()
    expect(paragraph(/카카오뱅크는 4조 2,240억 원을 남겼고/)).toBeInTheDocument()
    expect(screen.getByText(/조금 달라요/)).toBeInTheDocument()
  })

  it('says so when the numbers cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(respond({ error: { code: 'x', message: 'x' } }, 503))))
    render(<MemoryRouter><FinanceLesson /></MemoryRouter>)
    expect(await screen.findByText('재무 숫자를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.')).toBeInTheDocument()
  })
})

describe('BankFinancialsSection', () => {
  it('shows the main numbers, plain ratios with the peer range and the source', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(respond(financials('kb', '국민은행')))))
    render(<MemoryRouter><BankFinancialsSection bankCode="kb" /></MemoryRouter>)

    const table = await screen.findByRole('table', { name: '국민은행 2025년 별도재무제표 주요 숫자' })
    const assets = within(table).getByRole('row', { name: /자산총계/ })
    expect(assets).toHaveTextContent('563조 5,926억 원')
    expect(assets).toHaveTextContent('543조 5,964억 원')
    expect(assets).toHaveTextContent('+3.68%')
    expect(screen.getByText('6.87%')).toBeInTheDocument()
    expect(screen.getByText(/11개 은행 중 가장 낮은 곳 하나은행/)).toBeInTheDocument()
    expect(screen.getByText(/안전성 등급\(BIS 비율 등\)이 아니고/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '이 숫자를 읽는 법 배우기 →' })).toHaveAttribute('href', '/daily?tab=finance')
  })

  it('explains a bank without DART numbers instead of showing an error', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(respond({ error: { code: 'not_found', message: '없음' } }, 404))))
    render(<MemoryRouter><BankFinancialsSection bankCode="nh" /></MemoryRouter>)
    expect(await screen.findByText(/DART에 주요 재무 숫자가 없어요/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
