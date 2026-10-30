import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DailyPage } from './DailyPage'

function item(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    sourceCode: 'fsc_press',
    sourceName: '금융위원회 보도자료',
    sourceItemId: String(88000 + id),
    originalTitle: `공식 원문 제목 ${id}`,
    canonicalUrl: `https://www.fsc.go.kr/no010101/${88000 + id}`,
    publishedAt: '2026-10-28T15:00:00Z',
    generatedAt: '2026-10-30T01:55:40Z',
    plainHeadline: `쉽게 풀어쓴 제목 ${id}`,
    summaryPoints: [{ text: `핵심 내용 ${id}`, evidenceIds: ['p1'] }],
    whyItMatters: { text: `중요한 이유 ${id}`, evidenceIds: ['p1'] },
    relatedTerms: ['국민참여성장펀드'],
    caution: '공식 발표를 쉽게 풀어쓴 요약이며 투자·가입 권유가 아닙니다. 원문을 함께 확인하세요.',
    aiGenerated: true,
    ...overrides,
  }
}

const term = {
  slug: 'base-rate',
  name: '기준금리',
  shortDefinition: '중앙은행이 통화정책의 기준으로 삼는 금리입니다.',
  example: '기준금리가 바뀌면 예금 금리에도 영향을 줄 수 있습니다.',
  sourceName: '금융위원회 금융용어사전',
  sourceUrl: 'https://example.go.kr/terms/base-rate',
}

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
})

const headline = (number: number, region = 'domestic') => ({
  titleKo: null as string | null, summaryKo: null as string | null, reasons: [] as string[],
  title: `경제 헤드라인 ${number}`, publisher: 'example.co.kr', url: `https://example.co.kr/${region}/${number}`,
  publishedAt: '2026-10-30T05:38:41Z', topic: '기준금리', provider: 'naver',
})

function routeFetch(daily: () => Response, headlines: (region: string, featured: boolean) => Response) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/daily/headlines')) {
      const params = new URL(url, 'http://localhost').searchParams
      return Promise.resolve(headlines(params.get('region') ?? 'domestic', params.get('featured') === 'true'))
    }
    return Promise.resolve(daily())
  })
}

const noHeadlines = (region: string) => respond({ region, items: [] })

function stubDaily(items: unknown[], termValue: unknown = null) {
  vi.stubGlobal('fetch', routeFetch(() => respond({
    date: '2026-10-29', generatedAt: items.length ? '2026-10-30T01:55:40Z' : null, items, term: termValue,
  }), noHeadlines))
}

const renderPage = () => render(<MemoryRouter><DailyPage /></MemoryRouter>)

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('DailyPage', () => {
  it('says so plainly when nothing was published today', async () => {
    stubDaily([])
    renderPage()

    expect(await screen.findByText(/오늘 발행된 브리핑이 없습니다/)).toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.getByText('2026년 10월 29일')).toBeInTheDocument()
  })

  it('shows exactly the published cards for one and three items', async () => {
    stubDaily([item(1)])
    const first = renderPage()
    expect(await screen.findAllByRole('article')).toHaveLength(1)
    first.unmount()

    stubDaily([item(1), item(2), item(3)])
    renderPage()
    expect(await screen.findAllByRole('article')).toHaveLength(3)
  })

  it('separates the official original from the AI explanation', async () => {
    stubDaily([item(1)])
    renderPage()

    const card = await screen.findByRole('article')
    const original = within(card).getByLabelText('공식 원문')
    const ai = within(card).getByLabelText('AI 요약')

    expect(original).toHaveTextContent('공식 원문 제목 1')
    expect(within(original).getByRole('link', { name: /원문 보기/ })).toHaveAttribute('target', '_blank')
    expect(within(original).getByRole('link', { name: /원문 보기/ })).toHaveAttribute('rel', expect.stringContaining('noreferrer'))
    expect(ai).toHaveTextContent('AI가 공식 자료를 요약한 내용')
    expect(ai).toHaveTextContent('쉽게 풀어쓴 제목 1')
    expect(ai).toHaveTextContent('왜 중요한가')
    expect(ai).toHaveTextContent('투자·가입 권유가 아닙니다')
    expect(card).toHaveTextContent('발표일 2026년 10월 29일')
  })

  it('does not link to a non-https original address', async () => {
    stubDaily([item(1, { canonicalUrl: 'javascript:alert(1)' })])
    renderPage()

    const card = await screen.findByRole('article')
    expect(within(card).queryByRole('link', { name: /원문 보기/ })).not.toBeInTheDocument()
    expect(card).toHaveTextContent('원문 주소를 확인할 수 없습니다.')
  })

  it('shows the term of the day with its source, or a preparing notice', async () => {
    stubDaily([], term)
    const withTerm = renderPage()
    const termCard = await screen.findByRole('region', { name: '오늘의 금융용어' })
    expect(termCard).toHaveTextContent('기준금리')
    expect(within(termCard).getByRole('link', { name: /금융위원회 금융용어사전/ })).toHaveAttribute('href', term.sourceUrl)
    expect(termCard).toHaveTextContent('쉽게 말하면')
    expect(termCard).toHaveTextContent('기준금리가 바뀌면 예금 금리에도 영향을 줄 수 있습니다.')
    expect(within(termCard).getByText('공식 설명 보기')).toBeInTheDocument()
    expect(termCard).toHaveTextContent('중앙은행이 통화정책의 기준으로 삼는 금리입니다.')
    withTerm.unmount()

    stubDaily([], { ...term, example: '' })
    const withoutExample = renderPage()
    const plainCard = await screen.findByRole('region', { name: '오늘의 금융용어' })
    expect(plainCard).toHaveTextContent('중앙은행이 통화정책의 기준으로 삼는 금리입니다.')
    expect(plainCard).not.toHaveTextContent('쉽게 말하면')
    withoutExample.unmount()

    stubDaily([], null)
    renderPage()
    expect(await screen.findByText('오늘의 용어는 준비 중입니다.')).toBeInTheDocument()
  })

  it('links only to the fixed internal calculation screens', async () => {
    stubDaily([item(1)])
    renderPage()

    const nav = await screen.findByRole('navigation', { name: '관련 계산 화면' })
    const hrefs = within(nav).getAllByRole('link').map((link) => link.getAttribute('href'))

    expect(hrefs).toEqual(['/conditions', '/cashflow', '/alternatives', '/about'])
  })

  it('never shows an old result when loading fails, and recovers on retry', async () => {
    const user = userEvent.setup()
    let dailyCalls = 0
    vi.stubGlobal('fetch', routeFetch(() => {
      dailyCalls += 1
      return dailyCalls === 1
        ? respond({ error: { code: 'internal_error', message: '서버에서 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.' } }, 500)
        : respond({ date: '2026-10-29', generatedAt: '2026-10-30T01:55:40Z', items: [item(1)], term: null })
    }, noHeadlines))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('서버에서 문제가 발생했습니다.')
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.queryByText(/오늘 발행된 브리핑이 없습니다/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '다시 시도' }))

    expect(await screen.findAllByRole('article')).toHaveLength(1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('lists headlines as title-and-link only and survives a headline failure', async () => {
    vi.stubGlobal('fetch', routeFetch(
      () => respond({ date: '2026-10-29', generatedAt: null, items: [], term: null }),
      (region, featured) => featured
        ? respond({ region, items: [] })
        : region === 'domestic'
        ? respond({ region, items: [headline(1), { ...headline(2), url: 'http://insecure.example/2' }] })
        : respond({ error: { code: 'internal_error', message: '실패' } }, 500),
    ))
    renderPage()

    const domestic = await screen.findByRole('region', { name: '국내 경제 헤드라인' })
    const link = await within(domestic).findByRole('link', { name: /경제 헤드라인 1/ })
    expect(link).toHaveAttribute('href', 'https://example.co.kr/domestic/1')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'))
    expect(within(domestic).queryByRole('link', { name: /경제 헤드라인 2/ })).not.toBeInTheDocument()
    expect(domestic).toHaveTextContent('AI가 요약하지 않습니다')
    expect(domestic).not.toHaveTextContent('AI 번역·요약')
    const international = await screen.findByRole('region', { name: '해외 경제 헤드라인' })
    expect(await within(international).findByText(/헤드라인을 불러오지 못했습니다/)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the Korean interpretation of an international headline with its original title', async () => {
    vi.stubGlobal('fetch', routeFetch(
      () => respond({ date: '2026-10-29', generatedAt: null, items: [], term: null }),
      (region, featured) => region === 'international' && !featured
        ? respond({ region, items: [{
          ...headline(7, 'international'), title: 'Monetary policy decisions',
          titleKo: '통화정책 결정', summaryKo: '유럽중앙은행은 예금금리를 유지했습니다.',
        }] })
        : respond({ region, items: [] }),
    ))
    renderPage()

    const international = await screen.findByRole('region', { name: '해외 경제 헤드라인' })
    expect(await within(international).findByRole('link', { name: /통화정책 결정/ })).toBeInTheDocument()
    expect(international).toHaveTextContent('원문 제목: Monetary policy decisions')
    expect(international).toHaveTextContent('AI 번역·요약')
    expect(international).toHaveTextContent('유럽중앙은행은 예금금리를 유지했습니다.')
    expect(international).toHaveTextContent('번역에 오류가 있을 수 있습니다')
  })

  it('puts the rule-picked top news first with its reasons and keeps the full list below', async () => {
    vi.stubGlobal('fetch', routeFetch(
      () => respond({ date: '2026-10-29', generatedAt: null, items: [], term: null }),
      (region, featured) => featured
        ? respond({ region, items: [{ ...headline(9), title: '청년미래적금 가입 시작', reasons: ['청년미래적금 관련', '3곳의 언론이 같은 소식을 다룸'] }] })
        : respond({ region, items: [headline(1), headline(2)] }),
    ))
    renderPage()

    const domestic = await screen.findByRole('region', { name: '국내 경제 헤드라인' })
    expect(await within(domestic).findByRole('heading', { name: '오늘 주요 뉴스' })).toBeInTheDocument()
    expect(domestic).toHaveTextContent('선정 이유: 청년미래적금 관련 · 3곳의 언론이 같은 소식을 다룸')
    expect(domestic).toHaveTextContent('AI 판단이나 투자·가입 권유가 아닙니다')
    expect(domestic).toHaveTextContent('전체 헤드라인')
    expect(within(domestic).getAllByRole('link')).toHaveLength(3)
  })
})
