import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
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

const noBok = () => respond({ region: 'domestic', items: [] })
const noMarket = () => respond({ groups: [], rateTrend: [], sourceName: 'ECOS', sourceUrl: 'https://ecos.bok.or.kr/', updatedAt: null })
const noDigest = () => respond({ error: { code: 'not_found', message: '아직 경제 뉴스 요약이 없습니다.' } }, 404)
const noEvents = () => respond({ today: '2026-11-02', items: [] })

function routeFetch(
  daily: () => Response, headlines: (region: string, featured: boolean) => Response, digest: () => Response = noDigest,
  market: () => Response = noMarket,
  bok: () => Response = noBok,
  events: () => Response = noEvents,
) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/v1/events')) return Promise.resolve(events())
    if (url.includes('/daily/digest')) return Promise.resolve(digest())
    if (url.includes('/market')) return Promise.resolve(market())
    if (url.includes('provider=bok_press')) return Promise.resolve(bok())
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

function Where() {
  const location = useLocation()
  return <p data-testid="where">{location.pathname + location.search}</p>
}

const renderPage = (tab?: string) => render(
  <MemoryRouter initialEntries={[tab ? `/daily?tab=${tab}` : '/daily']}><DailyPage /><Where /></MemoryRouter>,
)

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
    const withTerm = renderPage('term')
    const termCard = await screen.findByRole('region', { name: '오늘의 금융용어' })
    expect(termCard).toHaveTextContent('기준금리')
    expect(within(termCard).getByRole('link', { name: /금융위원회 금융용어사전/ })).toHaveAttribute('href', term.sourceUrl)
    expect(termCard).toHaveTextContent('금융 선생님')
    expect(termCard).toHaveTextContent('기준금리가 바뀌면 예금 금리에도 영향을 줄 수 있습니다.')
    expect(within(termCard).getByText('사전에 나온 정확한 뜻 보기')).toBeInTheDocument()
    expect(termCard).toHaveTextContent('중앙은행이 통화정책의 기준으로 삼는 금리입니다.')
    withTerm.unmount()

    stubDaily([], { ...term, example: '' })
    const withoutExample = renderPage('term')
    const plainCard = await screen.findByRole('region', { name: '오늘의 금융용어' })
    expect(plainCard).toHaveTextContent('중앙은행이 통화정책의 기준으로 삼는 금리입니다.')
    expect(plainCard).not.toHaveTextContent('금융 선생님')
    withoutExample.unmount()

    stubDaily([], null)
    renderPage('term')
    expect(await screen.findByText(/오늘의 용어는 준비 중이에요/)).toBeInTheDocument()
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
    renderPage('news')

    const domestic = await screen.findByRole('region', { name: '국내 경제 헤드라인' })
    const link = await within(domestic).findByRole('link', { name: /경제 헤드라인 1/ })
    expect(link).toHaveAttribute('href', 'https://example.co.kr/domestic/1')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'))
    expect(within(domestic).queryByRole('link', { name: /경제 헤드라인 2/ })).not.toBeInTheDocument()
    expect(domestic).toHaveTextContent('AI 요약 없음')
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
    renderPage('news')

    const international = await screen.findByRole('region', { name: '해외 경제 헤드라인' })
    expect(await within(international).findByRole('link', { name: /통화정책 결정/ })).toBeInTheDocument()
    expect(international).toHaveTextContent('원문 제목: Monetary policy decisions')
    expect(international).toHaveTextContent('AI 번역·요약')
    expect(international).toHaveTextContent('유럽중앙은행은 예금금리를 유지했습니다.')
    expect(international).toHaveTextContent('AI 번역·요약은 틀릴 수 있어요')
  })

  it('puts the rule-picked top news first with its reasons and keeps the full list below', async () => {
    vi.stubGlobal('fetch', routeFetch(
      () => respond({ date: '2026-10-29', generatedAt: null, items: [], term: null }),
      (region, featured) => featured
        ? respond({ region, items: [{ ...headline(9), title: '청년미래적금 가입 시작', reasons: ['청년미래적금 관련', '3곳의 언론이 같은 소식을 다룸'] }] })
        : respond({ region, items: [headline(1), headline(2)] }),
    ))
    renderPage('news')

    const domestic = await screen.findByRole('region', { name: '국내 경제 헤드라인' })
    expect(await within(domestic).findByRole('heading', { name: '오늘 주요 뉴스' })).toBeInTheDocument()
    expect(domestic).toHaveTextContent('선정 이유: 청년미래적금 관련 · 3곳의 언론이 같은 소식을 다룸')
    expect(domestic).toHaveTextContent('정해진 규칙으로 골랐어요')
    expect(domestic).toHaveTextContent('전체 헤드라인')
    expect(within(domestic).getAllByRole('link')).toHaveLength(3)
  })

  it('shows the AI news digest with source links, and hides it when there is none', async () => {
    vi.stubGlobal('fetch', routeFetch(
      () => respond({ date: '2026-10-29', generatedAt: null, items: [], term: null }),
      noHeadlines,
      () => respond({
        digestDate: '2026-11-02', overview: '오늘은 금리 소식이 많았어요.', aiModel: 'test', createdAt: '2026-11-02T00:00:00Z',
        points: [{ text: '한국은행이 기준금리를 올렸어요.', sources: [
          { title: '한은 금리 인상', publisher: 'a.co.kr', url: 'https://a.co.kr/1' },
          { title: '위험한 링크', publisher: 'b.co.kr', url: 'javascript:alert(1)' },
        ] }],
      }),
    ))
    renderPage()

    const digest = await screen.findByRole('region', { name: '오늘의 경제 뉴스 요약' })
    expect(digest).toHaveTextContent('2026년 11월 2일')
    expect(digest).not.toHaveTextContent('오늘은 금리 소식이 많았어요.')
    expect(screen.getByRole('region', { name: '오늘 한눈에' })).toHaveTextContent('오늘은 금리 소식이 많았어요.')
    expect(within(digest).getByRole('link', { name: /a.co.kr/ })).toHaveAttribute('href', 'https://a.co.kr/1')
    expect(within(digest).queryByRole('link', { name: /b.co.kr/ })).not.toBeInTheDocument()
    expect(digest).toHaveTextContent('원문 링크에서 확인해 주세요')
    expect(screen.getByRole('region', { name: '안내' })).toHaveTextContent('기사 전문은 가져오지 않으니')

    cleanup()
    stubDaily([])
    renderPage()
    await screen.findByText(/오늘 발행된 브리핑이 없습니다/)
    expect(screen.queryByRole('region', { name: '오늘의 경제 뉴스 요약' })).not.toBeInTheDocument()
  })

  it('explains how rates reach savers with current rates and links, without advice', async () => {
    const rate = (code: string, name: string, value: string, period: string) => ({
      code, name, unit: '%', cycle: period.length === 8 ? 'D' : 'M', period, value, previousPeriod: null, change: null, changePercent: null,
    })
    vi.stubGlobal('fetch', routeFetch(
      () => respond({ date: '2026-10-29', generatedAt: null, items: [], term: null }),
      noHeadlines,
      noDigest,
      () => respond({ groups: [
        { key: 'fx', title: '환율', note: '', items: [{ ...rate('usd_krw', '원/달러', '1337.2', '20261030'), unit: '원' }] },
        { key: 'rate', title: '금리', note: '', items: [
          rate('base_rate', '한국은행 기준금리', '3', '20261030'), rate('ktb_3y', '국고채 3년', '3.715', '20261030'),
          rate('deposit_rate', '은행 예금 평균금리(신규)', '3.45', '202609'),
        ] },
      ], rateTrend: [], sourceName: 'ECOS', sourceUrl: 'https://ecos.bok.or.kr/', updatedAt: null }),
    ))
    renderPage()

    const context = await screen.findByRole('region', { name: '금리가 바뀌면 내 적금은 어떻게 될까요?' })
    expect(context).toHaveTextContent('금융 선생님')
    const rates = await within(context).findByRole('list', { name: '지금 금리' })
    expect(rates).toHaveTextContent('한국은행 기준금리 3% (2026년 10월 30일 기준)')
    expect(rates).toHaveTextContent('국고채 3년 3.72% (2026년 10월 30일 기준)')
    expect(rates).toHaveTextContent('은행 예금 평균금리(신규) 3.45% (2026년 9월 기준)')
    expect(within(rates).getAllByRole('listitem')).toHaveLength(3)
    expect(rates).not.toHaveTextContent('원/달러')
    expect(within(context).getByRole('link', { name: /이번 달 납입이 달라지면/ })).toHaveAttribute('href', '/cashflow')
    expect(within(context).getByRole('link', { name: '시장 지표 더 보기' })).toHaveAttribute('href', '/market')
    const notice = screen.getByRole('region', { name: '안내' })
    expect(notice).toHaveTextContent('예측하지 않아요')
    expect(notice).toHaveTextContent('가입·해지·매수를 권하지 않고')
    expect(context.textContent).not.toMatch(/[—–]/)
  })

  it("shows today's AI notes on what the news means for savers, with source links", async () => {
    const digest = (moneyNotes: unknown) => () => respond({
      digestDate: '2026-11-02', overview: '오늘은 금리 소식이 많았어요.', aiModel: 'test', createdAt: '2026-11-02T00:00:00Z',
      points: [{ text: '한국은행이 기준금리를 올렸어요.', sources: [{ title: '한은 금리 인상', publisher: 'a.co.kr', url: 'https://a.co.kr/1' }] }],
      ...(moneyNotes === undefined ? {} : { moneyNotes }),
    })
    const page = (moneyNotes: unknown) => {
      vi.stubGlobal('fetch', routeFetch(
        () => respond({ date: '2026-10-29', generatedAt: null, items: [], term: null }),
        noHeadlines, digest(moneyNotes), noMarket,
      ))
      renderPage()
      return screen.findByRole('region', { name: '금리가 바뀌면 내 적금은 어떻게 될까요?' })
    }

    let context = await page([{
      category: 'new_savings', text: '한국은행이 기준금리를 올렸어요. 이럴 때는 새 적금 이자도 오르는 경우가 많아요.',
      sources: [{ title: '한은 금리 인상', publisher: 'a.co.kr', url: 'https://a.co.kr/1' }, { title: '위험', publisher: 'b.co.kr', url: 'javascript:alert(1)' }],
    }])
    const notes = within(context).getByRole('list', { name: '오늘 소식과 내 돈' })
    expect(notes).toHaveTextContent('새로 드는 예금·적금')
    expect(notes).toHaveTextContent('새 적금 이자도 오르는 경우가 많아요')
    expect(within(notes).getByRole('link', { name: /a.co.kr/ })).toHaveAttribute('href', 'https://a.co.kr/1')
    expect(within(notes).queryByRole('link', { name: /b.co.kr/ })).not.toBeInTheDocument()
    expect(context).toHaveTextContent('AI가 쓴 풀이라 틀릴 수 있어요')
    expect(within(context).getByRole('list', { name: '금리가 움직이면 보통 이렇게 돼요' })).toBeInTheDocument()

    cleanup()
    context = await page([])
    expect(context).toHaveTextContent('바로 닿는 소식이 없었어요')
    expect(within(context).queryByRole('list', { name: '오늘 소식과 내 돈' })).not.toBeInTheDocument()

    cleanup()
    context = await page(undefined)
    expect(context).toHaveTextContent('하나씩 살펴볼까요?')
    expect(context).not.toHaveTextContent('AI 정리')
  })

  it('keeps the explanation and links when market rates fail to load', async () => {
    vi.stubGlobal('fetch', routeFetch(
      () => respond({ date: '2026-10-29', generatedAt: null, items: [], term: null }),
      noHeadlines,
      noDigest,
      () => respond({ error: { code: 'service_unavailable', message: '시장 지표를 불러오지 못했습니다.' } }, 503),
    ))
    renderPage()

    const context = await screen.findByRole('region', { name: '금리가 바뀌면 내 적금은 어떻게 될까요?' })
    expect(within(context).queryByRole('list', { name: '지금 금리' })).not.toBeInTheDocument()
    const points = within(context).getAllByRole('listitem')
    expect(points.map((point) => point.querySelector('b')?.textContent)).toEqual([
      '새로 적금에 들 때', '이미 넣고 있는 적금', '빌린 돈이 있을 때', '이번 달 덜 넣거나 쉬고 싶을 때',
    ])
    expect(points[1]).toHaveTextContent('상품 설명서를 한번 꺼내 보세요')
    expect(points[3]).toHaveTextContent('우대금리나 정부가 보태 주는 돈을 못 받을 수 있는데')
    expect(points[3]).toHaveTextContent('해지할 때 받는 돈은 여기서 계산하지 않으니')
    expect(within(context).getByRole('link', { name: /이번 달 납입이 달라지면/ })).toHaveAttribute('href', '/cashflow')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('puts what moved since the previous business day at the top, biggest first', async () => {
    const point = (code: string, name: string, unit: string, cycle: string, value: string, change: string | null, changePercent: string | null) => ({
      code, name, unit, cycle, period: cycle === 'D' ? '20261102' : '202609', value,
      previousPeriod: change === null ? null : '20261030', change, changePercent,
    })
    vi.stubGlobal('fetch', routeFetch(
      () => respond({ date: '2026-11-02', generatedAt: null, items: [], term: null }),
      noHeadlines,
      () => respond({ digestDate: '2026-11-02', overview: '오늘은 대출 금리 소식이 많았어요.', aiModel: 'm', createdAt: '2026-11-02T00:00:00Z', points: [], moneyNotes: [] }),
      () => respond({ groups: [
        { key: 'fx', title: '환율', note: '', items: [point('usd_krw', '원/달러', '원', 'D', '1337.2', '1.9', '0.14')] },
        { key: 'kr_stock', title: '국내 증시', note: '', items: [
          point('kospi', '코스피', 'pt', 'D', '2500', '-30', '-1.19'), point('kosdaq', '코스닥', 'pt', 'D', '800', '0', '0'),
        ] },
        { key: 'rate', title: '금리', note: '', items: [
          point('base_rate', '한국은행 기준금리', '%', 'D', '2.5', '0.25', '11.11'),
          point('deposit_rate', '은행 예금 평균금리(신규)', '%', 'M', '3.45', '0.1', '2.98'),
        ] },
      ], rateTrend: [], sourceName: 'ECOS', sourceUrl: 'https://ecos.bok.or.kr/', updatedAt: null }),
    ))
    renderPage()

    const glance = await screen.findByRole('region', { name: '오늘 한눈에' })
    expect(glance).toHaveTextContent('오늘은 대출 금리 소식이 많았어요.')
    const moves = await within(glance).findAllByRole('listitem')
    expect(moves.map((move) => move.textContent)).toEqual([
      '한국은행 기준금리2.5%▲ +0.25%p', '코스피2,500▼ -1.19%', '원/달러1,337.2원▲ +0.14%',
    ])
    expect(moves[1]).toHaveClass('daily-move--down')
    expect(glance).toHaveTextContent('변동 없음 1개')
    expect(glance).not.toHaveTextContent('은행 예금 평균금리')  // monthly figures are not "since yesterday"
    expect(within(glance).getByRole('link', { name: '시장 지표 전체 보기' })).toHaveAttribute('href', '/market')
    expect(screen.getByRole('region', { name: '안내' })).toBeInTheDocument()
  })

  it('shows a monthly figure such as CPI only on the days right after it arrives', async () => {
    const cpi = (isNew: boolean) => ({
      code: 'cpi_yoy', name: '소비자물가 상승률(전년 같은 달 대비)', unit: '%', cycle: 'M', period: '202609', value: '2.5',
      previousPeriod: '202608', change: '0.1', changePercent: null, isNew,
    })
    const page = (isNew: boolean) => {
      vi.stubGlobal('fetch', routeFetch(
        () => respond({ date: '2026-11-02', generatedAt: null, items: [], term: null }),
        noHeadlines, noDigest,
        () => respond({ groups: [{ key: 'price', title: '물가', note: '', items: [cpi(isNew)] }], rateTrend: [], sourceName: 'ECOS', sourceUrl: 'https://ecos.bok.or.kr/', updatedAt: null }),
      ))
      renderPage()
    }

    page(true)
    const fresh = await screen.findByRole('list', { name: '새로 나온 통계' })
    expect(fresh).toHaveTextContent('2026년 9월 소비자물가 상승률(전년 같은 달 대비) 2.5% (전달보다 ▲ +0.1%p)')

    cleanup()
    page(false)
    await screen.findByRole('region', { name: '오늘 한눈에' })
    await screen.findByText(/오늘 발행된 브리핑이 없습니다/)
    expect(screen.queryByRole('list', { name: '새로 나온 통계' })).not.toBeInTheDocument()
  })

  it('shows at most five moved indicators and counts the rest', async () => {
    const moving = Array.from({ length: 7 }, (_, index) => ({
      code: `s${index}`, name: `지표${index}`, unit: 'pt', cycle: 'D', period: '20261102', value: '100',
      previousPeriod: '20261030', change: String(index + 1), changePercent: String(index + 1),
    }))
    vi.stubGlobal('fetch', routeFetch(
      () => respond({ date: '2026-11-02', generatedAt: null, items: [], term: null }),
      noHeadlines, noDigest,
      () => respond({ groups: [{ key: 'kr_stock', title: '국내 증시', note: '', items: moving }], rateTrend: [], sourceName: 'ECOS', sourceUrl: 'https://ecos.bok.or.kr/', updatedAt: null }),
    ))
    renderPage()

    const moves = await screen.findByRole('list', { name: '달라진 지표' })
    expect(within(moves).getAllByRole('listitem').map((move) => move.firstChild?.textContent)).toEqual(['지표6', '지표5', '지표4', '지표3', '지표2'])
    expect(screen.getByRole('region', { name: '오늘 한눈에' })).toHaveTextContent('그 밖에 달라진 지표 2개')
    expect(screen.getByRole('region', { name: '오늘 한눈에' })).not.toHaveTextContent('변동 없음')
  })

  it('switches tabs by click and arrow keys, showing one panel at a time', async () => {
    const user = userEvent.setup()
    stubDaily([], term)
    renderPage()

    const summaryTab = await screen.findByRole('tab', { name: '요약' })
    expect(summaryTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('region', { name: '오늘의 금융용어' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: '용어' }))
    expect(screen.getByRole('tab', { name: '용어' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('기준금리')
    expect(screen.getByText(/오늘 발행된 브리핑이 없습니다/).closest('[role="tabpanel"]')).not.toBeVisible()
    expect(screen.getByTestId('where')).toHaveTextContent('/daily?tab=term')
    for (const tab of screen.getAllByRole('tab')) {
      expect(document.getElementById(tab.getAttribute('aria-controls') ?? '')).not.toBeNull()
    }

    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: '요약' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: '요약' })).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: '용어' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('region', { name: '국내 경제 헤드라인' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: '요약' }))
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/daily$/)
  })

  it('opens the tab named in the address and falls back to the summary for unknown values', async () => {
    stubDaily([], term)
    const opened = renderPage('news')
    expect(await screen.findByRole('tab', { name: '뉴스' })).toHaveAttribute('aria-selected', 'true')
    opened.unmount()

    stubDaily([], term)
    renderPage('nope')
    expect(await screen.findByRole('tab', { name: '요약' })).toHaveAttribute('aria-selected', 'true')
  })

  it('loads market data once and keeps the page-wide notice even when the briefing fails', async () => {
    const fetch = routeFetch(() => respond({ error: { code: 'internal_error', message: '서버에서 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.' } }, 500), noHeadlines)
    vi.stubGlobal('fetch', fetch)
    renderPage()

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '안내' })).toHaveTextContent('예측하지 않아요')
    expect(fetch.mock.calls.filter(([input]) => String(input).includes('/market'))).toHaveLength(1)
  })

  it('shows the nearest official date at the top and the full list in the events tab', async () => {
    const user = userEvent.setup()
    const event = (key: string, date: string, dDay: number, kind: string, title: string, sourceUrl: string, tentative = false) => ({
      key, date, dDay, kind, title, why: `${title} 설명`, sourceName: `${title} 출처`, sourceUrl, checkedOn: '2026-11-02', tentative,
    })
    vi.stubGlobal('fetch', routeFetch(
      () => respond({ date: '2026-11-02', generatedAt: null, items: [], term: null }),
      noHeadlines, noDigest, noMarket, noBok,
      () => respond({ today: '2026-11-02', items: [
        event('election-us', '2026-11-03', 1, 'election', '미국 중간선거', 'https://www.ncsbe.gov/x'),
        event('bok', '2026-11-26', 24, 'rate_decision', '한국은행 기준금리 결정', 'https://www.bok.or.kr/x'),
        event('fomc', '2027-01-27', 86, 'fomc', '미국 FOMC', 'javascript:alert(1)', true),
      ] }),
    ))
    renderPage()

    const glance = await screen.findByRole('region', { name: '오늘 한눈에' })
    expect(await within(glance).findByText(/다가올 일정/)).toHaveTextContent('D-1 다가올 일정: 11월 3일(화) 미국 중간선거')
    await user.click(within(glance).getByRole('button', { name: '일정 더 보기' }))

    expect(screen.getByRole('tab', { name: '일정' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('where')).toHaveTextContent('/daily?tab=events')
    const list = screen.getByRole('region', { name: '다가올 일정' })
    const items = within(list).getAllByRole('listitem')
    expect(items.map((item) => item.querySelector('.daily-event__dday')?.textContent)).toEqual(['D-1', 'D-24', 'D-86'])
    expect(items[1]).toHaveTextContent('11월 26일(목) 기준금리 결정한국은행 기준금리 결정')
    expect(within(items[1]).getByRole('link', { name: /한국은행 기준금리 결정 출처/ })).toHaveAttribute('href', 'https://www.bok.or.kr/x')
    expect(items[2]).toHaveTextContent('(잠정)')
    expect(within(items[2]).queryByRole('link')).not.toBeInTheDocument()
    expect(list).toHaveTextContent('결과를 예측하거나 해석하지 않아요')
  })

  it('marks a date that is today and says so when nothing is coming up', async () => {
    vi.stubGlobal('fetch', routeFetch(
      () => respond({ date: '2026-11-26', generatedAt: null, items: [], term: null }),
      noHeadlines, noDigest, noMarket, noBok,
      () => respond({ today: '2026-11-26', items: [{
        key: 'bok', date: '2026-11-26', dDay: 0, kind: 'rate_decision', title: '한국은행 기준금리 결정', why: '설명',
        sourceName: '출처', sourceUrl: 'https://www.bok.or.kr/x', checkedOn: '2026-11-02', tentative: false,
      }] }),
    ))
    const today = renderPage('events')
    const badge = (await screen.findByRole('region', { name: '다가올 일정' })).querySelector('.daily-event__dday')
    expect(badge).toHaveTextContent('오늘')
    expect(badge).toHaveClass('daily-event__dday--today')
    expect(screen.getByRole('region', { name: '오늘 한눈에' })).toHaveTextContent('오늘 다가올 일정: 11월 26일(목)')
    today.unmount()

    vi.stubGlobal('fetch', routeFetch(
      () => respond({ date: '2026-11-26', generatedAt: null, items: [], term: null }), noHeadlines,
    ))
    renderPage('events')
    expect(await screen.findByText('앞으로 60일 안에 넣어 둔 공식 일정이 없어요.')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '오늘 한눈에' })).not.toHaveTextContent('다가올 일정')
  })

  it('says so in the events tab when the dates cannot be loaded, without an alert', async () => {
    vi.stubGlobal('fetch', routeFetch(
      () => respond({ date: '2026-11-02', generatedAt: null, items: [], term: null }),
      noHeadlines, noDigest, noMarket, noBok,
      () => respond({ error: { code: 'internal_error', message: '실패' } }, 500),
    ))
    renderPage('events')

    expect(await screen.findByText('일정을 불러오지 못했어요. 잠시 후 다시 확인해 주세요.')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '오늘 한눈에' })).not.toHaveTextContent('다가올 일정')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('lists Bank of Korea press releases as title and link only', async () => {
    vi.stubGlobal('fetch', routeFetch(
      () => respond({ date: '2026-10-29', generatedAt: null, items: [], term: null }),
      noHeadlines, noDigest, noMarket,
      () => respond({ region: 'domestic', items: [
        { ...headline(1), title: '[보도참고자료] 2026년 11월 통화안정증권 발행 계획', publisher: '한국은행', provider: 'bok_press', url: 'https://www.bok.or.kr/portal/bbs/B0000502/view.do?nttId=1' },
      ] }),
    ))
    renderPage('news')

    const bok = await screen.findByRole('region', { name: '한국은행 새 소식' })
    expect(within(bok).getByRole('link', { name: /통화안정증권 발행 계획/ })).toHaveAttribute('href', 'https://www.bok.or.kr/portal/bbs/B0000502/view.do?nttId=1')
    expect(bok).toHaveTextContent('출처: 한국은행 보도자료')
    expect(bok).toHaveTextContent('내용을 가져오거나 요약하지 않아요')
    expect(bok).not.toHaveTextContent('AI')
  })

  it('hides the Bank of Korea list when nothing is collected', async () => {
    stubDaily([])
    renderPage('news')
    expect(await screen.findAllByText('아직 수집된 헤드라인이 없습니다.')).toHaveLength(2)
    expect(screen.queryByRole('region', { name: '한국은행 새 소식' })).not.toBeInTheDocument()
  })

  it('hides the Bank of Korea list when the request fails and never links outside bok.or.kr', async () => {
    vi.stubGlobal('fetch', routeFetch(
      () => respond({ date: '2026-10-29', generatedAt: null, items: [], term: null }),
      noHeadlines, noDigest, noMarket,
      () => respond({ error: { code: 'service_unavailable', message: '뉴스 헤드라인을 불러오지 못했습니다.' } }, 503),
    ))
    renderPage('news')
    expect(await screen.findAllByText('아직 수집된 헤드라인이 없습니다.')).toHaveLength(2)
    expect(screen.queryByRole('region', { name: '한국은행 새 소식' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    cleanup()
    vi.stubGlobal('fetch', routeFetch(
      () => respond({ date: '2026-10-29', generatedAt: null, items: [], term: null }),
      noHeadlines, noDigest, noMarket,
      () => respond({ region: 'domestic', items: [{ ...headline(2), title: '외부 주소 항목', provider: 'bok_press', url: 'https://example.com/bok' }] }),
    ))
    renderPage('news')
    const bok = await screen.findByRole('region', { name: '한국은행 새 소식' })
    expect(bok).toHaveTextContent('외부 주소 항목')
    expect(within(bok).queryByRole('link')).not.toBeInTheDocument()
  })
})
