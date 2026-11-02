import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  getDaily, getEvents, getMarket, getNewsDigest, getNewsHeadlines,
  type DailyBriefingItem, type DailyBriefingResponse, type DailyTerm, type DigestSource, type EventKind, type MarketItem,
  type MoneyNoteCategory, type NewsDigest, type NewsHeadline, type UpcomingEvent,
} from '../api/client'
import teacherImage from '../assets/icons/finance-teacher.png'
import { ErrorNotice } from '../components/ErrorNotice'
import './DailyPage.css'

const KST = 'Asia/Seoul'

function formatDate(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number)
  return `${year}년 ${month}월 ${day}일`
}

function formatPublished(iso: string) {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: KST, year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(iso))
}

function formatGenerated(iso: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: KST, month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso))
}

function isOfficialLink(url: string) {
  return url.startsWith('https://')
}

function BriefingCard({ item }: { item: DailyBriefingItem }) {
  return <article className="daily-card" aria-labelledby={`daily-item-${item.id}`}>
    <header className="daily-card__meta">
      <span className="daily-tag">{item.sourceName}</span>
      <span>발표일 {formatPublished(item.publishedAt)}</span>
    </header>

    <section className="daily-original" aria-label="공식 원문">
      <b className="daily-label">공식 원문 제목</b>
      <p>{item.originalTitle}</p>
      {isOfficialLink(item.canonicalUrl)
        ? <a href={item.canonicalUrl} target="_blank" rel="noreferrer">원문 보기 ↗</a>
        : <span className="daily-muted">원문 주소를 확인할 수 없습니다.</span>}
    </section>

    <section className="daily-ai" aria-label="AI 요약">
      <b className="daily-label daily-label--ai">AI가 공식 자료를 요약한 내용</b>
      <h2 id={`daily-item-${item.id}`}>{item.plainHeadline}</h2>
      <ul className="daily-points">
        {item.summaryPoints.map((point, index) => <li key={index}>{point.text}</li>)}
      </ul>
      <div className="daily-why">
        <b>왜 중요한가</b>
        <p>{item.whyItMatters.text}</p>
      </div>
      {item.relatedTerms.length > 0 && <p className="daily-terms">
        <b>관련 용어</b>{' '}
        {item.relatedTerms.map((term) => <span className="daily-chip" key={term}>{term}</span>)}
      </p>}
      <p className="daily-caution">{item.caution}</p>
      <p className="daily-muted">AI 생성 {formatGenerated(item.generatedAt)}</p>
    </section>
  </article>
}

function TeacherNote({ children }: { children: ReactNode }) {
  return <div className="daily-teacher">
    <img className="daily-teacher__face" src={teacherImage} alt="" width={96} height={96} />
    <div className="daily-teacher__bubble">
      <b className="daily-teacher__name">금융 선생님</b>
      {children}
    </div>
  </div>
}

function TermCard({ term }: { term: DailyTerm | null }) {
  if (!term) {
    return <section className="daily-term" aria-labelledby="daily-term-title">
      <h2 id="daily-term-title">오늘의 금융용어</h2>
      <p className="daily-muted">오늘의 용어는 준비 중이에요. 내일 다시 와 주세요.</p>
    </section>
  }
  const easy = term.example.trim()
  return <section className="daily-term" aria-labelledby="daily-term-title">
    <h2 id="daily-term-title">오늘의 금융용어</h2>
    <p className="daily-term__name">{term.name}</p>
    {easy && <TeacherNote><p>{easy}</p></TeacherNote>}
    <details className="daily-term__official">
      <summary>{easy ? '사전에 나온 정확한 뜻 보기' : '뜻 보기'}</summary>
      <p className="daily-term__definition">{term.shortDefinition}</p>
    </details>
    {easy && <p className="daily-muted">선생님 설명은 이해하기 쉽게 따로 풀어 쓴 말이에요. 정확한 뜻은 사전 설명을 기준으로 봐 주세요.</p>}
    <p className="daily-muted">
      출처 {isOfficialLink(term.sourceUrl)
        ? <a href={term.sourceUrl} target="_blank" rel="noreferrer">{term.sourceName} ↗</a>
        : term.sourceName}
    </p>
  </section>
}

const HEADLINE_REGIONS = [
  { region: 'domestic', title: '국내 경제 헤드라인', provider: '네이버 뉴스 검색' },
  { region: 'international', title: '해외 경제 헤드라인', provider: '공식 기관 RSS' },
] as const

function HeadlineItem({ item }: { item: NewsHeadline }) {
  return <li>
    {isOfficialLink(item.url)
      ? <a href={item.url} target="_blank" rel="noreferrer">{item.titleKo ?? item.title} ↗</a>
      : <span>{item.titleKo ?? item.title}</span>}
    <span className="daily-muted"> {item.publisher} · {formatPublished(item.publishedAt)}</span>
    {item.titleKo && <span className="daily-muted daily-headlines__original">원문 제목: {item.title}</span>}
    {item.summaryKo && <span className="daily-headlines__summary"><span className="daily-label daily-label--ai">AI 번역·요약</span> {item.summaryKo}</span>}
    {item.reasons.length > 0 && <span className="daily-muted daily-headlines__reason">선정 이유: {item.reasons.join(' · ')}</span>}
  </li>
}

function HeadlineList({ region, title, provider }: (typeof HEADLINE_REGIONS)[number]) {
  const [items, setItems] = useState<NewsHeadline[] | null>(null)
  const [featured, setFeatured] = useState<NewsHeadline[]>([])
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    getNewsHeadlines(region, controller.signal).then((body) => setItems(body.items)).catch((cause: unknown) => {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      setFailed(true)
    })
    getNewsHeadlines(region, controller.signal, true).then((body) => setFeatured(body.items)).catch(() => setFeatured([]))
    return () => controller.abort()
  }, [region])

  return <section className="daily-headlines" aria-labelledby={`headlines-${region}`}>
    <h2 id={`headlines-${region}`}>{title}</h2>
    {failed && <p className="daily-muted">헤드라인을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.</p>}
    {!failed && items === null && <p className="daily-muted">헤드라인을 불러오는 중입니다.</p>}
    {items && items.length === 0 && <p className="daily-muted">아직 수집된 헤드라인이 없습니다.</p>}
    {featured.length > 0 && <div className="daily-featured">
      <h3>오늘 주요 뉴스</h3>
      <ol className="daily-headlines__list">{featured.map((item) => <HeadlineItem key={item.url} item={item} />)}</ol>
      <p className="daily-muted">관련 주제, 같은 소식을 다룬 언론 수, 발행 시각이라는 정해진 규칙으로 골랐어요.</p>
    </div>}
    {items && items.length > 0 && <>
      <details className="daily-fold">
        <summary>전체 헤드라인 {items.length}개 보기</summary>
        <ul className="daily-headlines__list">
          {items.map((item) => <HeadlineItem key={item.url} item={item} />)}
        </ul>
      </details>
      <p className="daily-muted">{region === 'international'
        ? `출처: ${provider} · AI 번역·요약은 틀릴 수 있어요`
        : `제공: ${provider} · 제목과 링크만 보여 줘요(AI 요약 없음)`}</p>
    </>}
  </section>
}

function SourceLinks({ sources }: { sources: DigestSource[] }) {
  return <span className="daily-muted">
    {sources.map((source, index) => <span key={source.url}>
      {index > 0 && ' · '}
      {isOfficialLink(source.url)
        ? <a href={source.url} target="_blank" rel="noreferrer" title={source.title}>{source.publisher} ↗</a>
        : source.publisher}
    </span>)}
  </span>
}

function NewsDigestCard({ digest }: { digest: NewsDigest | null }) {
  if (!digest) return null
  return <section className="daily-digest" aria-labelledby="daily-digest-title">
    <h2 id="daily-digest-title">오늘의 경제 뉴스 요약</h2>
    {/* The one-line overview is already at the top of the page in "오늘 한눈에". */}
    <p className="daily-muted">{formatDate(digest.digestDate)} · <span className="daily-label daily-label--ai">AI 요약</span></p>
    <ol className="daily-digest__points">
      {digest.points.map((point) => <li key={point.text}>
        <p>{point.text}</p>
        <SourceLinks sources={point.sources} />
      </li>)}
    </ol>
    <p className="daily-muted">뉴스 제목과 짧은 요약문만 보고 AI가 정리했어요. 정확한 내용은 원문 링크에서 확인해 주세요.</p>
  </section>
}

// Bank of Korea press releases are not public data, so its copyright policy allows linking only:
// title, date and link, no AI summary. Hidden when nothing is collected or the request fails.
function BokPressList() {
  const [items, setItems] = useState<NewsHeadline[]>([])

  useEffect(() => {
    const controller = new AbortController()
    getNewsHeadlines('domestic', controller.signal, false, 'bok_press').then((body) => setItems(body.items)).catch(() => setItems([]))
    return () => controller.abort()
  }, [])

  if (items.length === 0) return null
  return <section className="daily-headlines" aria-labelledby="headlines-bok">
    <h2 id="headlines-bok">한국은행 새 소식</h2>
    <ul className="daily-headlines__list">
      {items.map((item) => <li key={item.url}>
        {item.url.startsWith('https://www.bok.or.kr/')
          ? <a href={item.url} target="_blank" rel="noreferrer">{item.title} ↗</a>
          : <span>{item.title}</span>}
        <span className="daily-muted"> {formatPublished(item.publishedAt)}</span>
      </li>)}
    </ul>
    <p className="daily-muted">출처: 한국은행 보도자료 · 제목과 원문 링크만 보여 주며 내용을 가져오거나 요약하지 않아요</p>
  </section>
}

const MONEY_RATE_CODES = ['base_rate', 'deposit_rate', 'ktb_3y']

function formatMarketPeriod(period: string) {
  const [year, month, day] = [period.slice(0, 4), Number(period.slice(4, 6)), period.slice(6, 8)]
  return day ? `${year}년 ${month}월 ${Number(day)}일` : `${year}년 ${month}월`
}

const MONEY_NOTE_LABELS: Record<MoneyNoteCategory, string> = {
  new_savings: '새로 드는 예금·적금',
  current_savings: '이미 넣고 있는 적금',
  loan: '빌린 돈(대출)',
  fx: '환율·해외 결제',
}

// Today's AI notes come from the digest and are checked on the server (cited news, no forecast or advice).
// The fixed explanations below them are reviewed text, shown every day.
function TodayMoneyNotes({ digest }: { digest: NewsDigest | null }) {
  const notes = digest?.moneyNotes
  if (!notes) {
    return <p>금리는 돈을 맡기거나 빌릴 때 붙는 이자의 비율이에요. 한국은행이 정하는 기준금리가 움직이면 은행들의 금리도 따라 움직이는 일이 많아요. 그게 내 돈에 어떻게 닿는지 하나씩 살펴볼까요?</p>
  }
  if (notes.length === 0) {
    return <p>오늘 뉴스에는 예금·적금 이자나 대출 이자, 환율에 바로 닿는 소식이 없었어요. 금리가 보통 내 돈에 어떻게 닿는지는 아래에서 살펴볼 수 있어요.</p>
  }
  return <>
    <p>오늘 뉴스 가운데 내 돈과 닿는 소식을 골라 봤어요.</p>
    <ul className="daily-context__today" aria-label="오늘 소식과 내 돈">
      {notes.map((note, index) => <li key={index}>
        <span className="daily-chip">{MONEY_NOTE_LABELS[note.category] ?? '내 돈'}</span>
        <p>{note.text}</p>
        <SourceLinks sources={note.sources} />
      </li>)}
    </ul>
    <p className="daily-muted"><span className="daily-label daily-label--ai">AI 정리</span> AI가 쓴 풀이라 틀릴 수 있어요.</p>
  </>
}

function MoneyContextCard({ digest, market }: { digest: NewsDigest | null; market: MarketItem[] }) {
  const rates = market.filter((item) => MONEY_RATE_CODES.includes(item.code))
  return <section className="daily-context" aria-labelledby="daily-context-title">
    <h2 id="daily-context-title">금리가 바뀌면 내 적금은 어떻게 될까요?</h2>
    <TeacherNote>
      <TodayMoneyNotes digest={digest} />
    </TeacherNote>
    {rates.length > 0 && <ul className="daily-context__rates" aria-label="지금 금리">
      {rates.map((item) => <li key={item.code}>
        <span>{item.name}</span> <b>{Number(item.value).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}%</b>
        <span className="daily-muted"> ({formatMarketPeriod(item.period)} 기준)</span>
      </li>)}
    </ul>}
    <details className="daily-fold">
      <summary>금리가 움직이면 보통 이렇게 돼요</summary>
      <ul className="daily-context__points" aria-label="금리가 움직이면 보통 이렇게 돼요">
        <li><b>새로 적금에 들 때</b> 기준금리가 오르면 은행이 새로 내놓는 예금과 적금의 이자도 대개 같이 올라요. 기준금리가 내려가면 새 상품의 이자도 낮아지는 일이 많아요.</li>
        <li><b>이미 넣고 있는 적금</b> 대부분은 가입한 날 정한 이자율이 만기까지 그대로 가요. 그래서 기준금리가 바뀌어도 내 적금 이자는 그대로인 경우가 많아요. 중간에 이자율이 바뀌는 상품도 있으니, 가입할 때 받은 상품 설명서를 한번 꺼내 보세요.</li>
        <li><b>빌린 돈이 있을 때</b> 변동금리 대출은 금리가 오르면 매달 내는 이자도 늘어날 수 있어요.</li>
        <li><b>이번 달 덜 넣거나 쉬고 싶을 때</b> 한 달을 덜 넣거나 건너뛰면 만기에 받는 돈이 줄어들 수 있어요. 덜 넣거나 건너뛰었을 때 얼마나 달라지는지는 아래 버튼을 눌러 내 숫자로 계산해 볼 수 있어요. 아예 만기 전에 해지하면 약속받았던 우대금리나 정부가 보태 주는 돈을 못 받을 수 있는데, 해지할 때 받는 돈은 여기서 계산하지 않으니 가입한 은행에서 확인해 주세요.</li>
      </ul>
    </details>
    <p className="daily-context__links">
      <Link className="button button--secondary" to="/cashflow">이번 달 납입이 달라지면? 계산하기</Link>
      <Link className="button button--secondary" to="/market">시장 지표 더 보기</Link>
    </p>
  </section>
}

const GLANCE_LIMIT = 5
const WEEKDAYS = '일월화수목금토'

const EVENT_KIND_LABELS: Record<EventKind, string> = {
  rate_decision: '기준금리 결정',
  fomc: '미국 금리 결정',
  statistics: '경제 통계 발표',
  election: '선거',
}

function formatEventDate(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number)
  return `${month}월 ${day}일(${WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]})`
}

function dDayLabel(dDay: number) {
  return dDay === 0 ? '오늘' : `D-${dDay}`
}

// Official dates only, each with its source; political dates say what is decided, never a view on it.
function EventList({ events }: { events: UpcomingEvent[] | null }) {
  return <section className="daily-events" aria-labelledby="daily-events-title">
    <h2 id="daily-events-title">다가올 일정</h2>
    {events === null && <p className="daily-muted">일정을 불러오지 못했어요. 잠시 후 다시 확인해 주세요.</p>}
    {events && events.length === 0 && <p className="daily-muted">앞으로 60일 안에 넣어 둔 공식 일정이 없어요.</p>}
    {events && events.length > 0 && <ol className="daily-events__list">
      {events.map((event) => <li key={event.key} className="daily-event">
        <span className={`daily-event__dday${event.dDay === 0 ? ' daily-event__dday--today' : ''}`}>{dDayLabel(event.dDay)}</span>
        <div>
          <p className="daily-event__head">
            <b>{formatEventDate(event.date)}</b> <span className="daily-chip">{EVENT_KIND_LABELS[event.kind] ?? '일정'}</span>
          </p>
          <p className="daily-event__title">{event.title}{event.tentative && <span className="daily-muted"> (잠정)</span>}</p>
          <p className="daily-event__why">{event.why}</p>
          <p className="daily-muted">출처 {isOfficialLink(event.sourceUrl)
            ? <a href={event.sourceUrl} target="_blank" rel="noreferrer">{event.sourceName} ↗</a>
            : event.sourceName}</p>
        </div>
      </li>)}
    </ol>}
    <p className="daily-muted">각 기관이 공개한 일정이며 사정에 따라 바뀔 수 있어요. 결과를 예측하거나 해석하지 않아요.</p>
  </section>
}

function formatValue(item: MarketItem) {
  const value = Number(item.value).toLocaleString('ko-KR', { maximumFractionDigits: 2 })
  return item.unit === '%' ? `${value}%` : item.unit === '원' ? `${value}원` : value
}

// Rates move in percentage points; prices and indices in percent of the previous value.
function formatChange(item: MarketItem) {
  const change = Number(item.change)
  const sign = change > 0 ? '+' : ''
  if (item.unit === '%') return `${sign}${change.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}%p`
  const percent = Number(item.changePercent ?? 0)
  return `${percent > 0 ? '+' : ''}${percent.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}%`
}

// Ranked by change relative to the previous value for every series, so rates and prices share one scale.
function changeSize(item: MarketItem) {
  return Math.abs(Number(item.changePercent ?? 0))
}

// Daily series only: "어제와 달라진 것" compares with the previous business day.
function TodayGlance({ date, generatedAt, digest, market, nextEvent, onShowEvents }: {
  date: string; generatedAt: string | null; digest: NewsDigest | null; market: MarketItem[]
  nextEvent: UpcomingEvent | null; onShowEvents: () => void
}) {
  const daily = market.filter((item) => item.cycle === 'D' && item.change !== null && item.change !== undefined)
  const moved = daily.filter((item) => Number(item.change) !== 0).sort((a, b) => changeSize(b) - changeSize(a))
  const still = daily.length - moved.length
  return <section className="daily-glance" aria-labelledby="daily-glance-title">
    <h2 id="daily-glance-title">오늘 한눈에</h2>
    <p className="daily-glance__date">
      <b>{formatDate(date)}</b>
      {generatedAt && <span className="daily-muted"> · 최종 갱신 {formatGenerated(generatedAt)}</span>}
    </p>
    {digest && <p className="daily-glance__overview">
      <span className="daily-label daily-label--ai">AI 요약</span> {digest.overview}
    </p>}
    {nextEvent && <p className="daily-glance__event">
      <span className="daily-event__dday">{dDayLabel(nextEvent.dDay)}</span>{' '}
      다가올 일정: <b>{formatEventDate(nextEvent.date)} {nextEvent.title}</b>{' '}
      <button type="button" className="daily-link-button" onClick={onShowEvents}>일정 더 보기</button>
    </p>}
    {daily.length > 0 && <div className="daily-glance__moves">
      <h3>전 영업일보다 달라진 지표</h3>
      {moved.length > 0 && <ul aria-label="달라진 지표">
        {moved.slice(0, GLANCE_LIMIT).map((item) => {
          const up = Number(item.change) > 0
          return <li key={item.code} className={`daily-move daily-move--${up ? 'up' : 'down'}`}>
            <span className="daily-move__name">{item.name}</span>
            <span className="daily-move__value">{formatValue(item)}</span>
            <span className="daily-move__change">{up ? '▲' : '▼'} {formatChange(item)}</span>
          </li>
        })}
      </ul>}
      <p className="daily-muted">
        {moved.length > GLANCE_LIMIT && `그 밖에 달라진 지표 ${moved.length - GLANCE_LIMIT}개 · `}
        {still > 0 && `변동 없음 ${still}개 · `}
        <Link to="/market">시장 지표 전체 보기</Link>
      </p>
    </div>}
  </section>
}

const TABS = [
  { key: 'summary', label: '요약' },
  { key: 'news', label: '뉴스' },
  { key: 'events', label: '일정' },
  { key: 'term', label: '용어' },
] as const
type TabKey = (typeof TABS)[number]['key']

function DailyTabs({ active, onChange, panels }: {
  active: TabKey; onChange: (key: TabKey) => void; panels: Record<TabKey, ReactNode>
}) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const index = (TABS.findIndex((tab) => tab.key === active) + step + TABS.length) % TABS.length
    onChange(TABS[index].key)
    document.getElementById(`daily-tab-${TABS[index].key}`)?.focus()
  }
  return <div className="daily-tabs">
    <div className="daily-tabs__list" role="tablist" aria-label="오늘의 머니 보기" onKeyDown={onKeyDown}>
      {TABS.map((tab) => <button
        key={tab.key} id={`daily-tab-${tab.key}`} type="button" role="tab"
        aria-selected={active === tab.key} aria-controls={`daily-panel-${tab.key}`} tabIndex={active === tab.key ? 0 : -1}
        className="daily-tabs__tab" onClick={() => onChange(tab.key)}
      >{tab.label}</button>)}
    </div>
    {TABS.map((tab) => <div
      key={tab.key} className="daily-tabs__panel" role="tabpanel" id={`daily-panel-${tab.key}`}
      aria-labelledby={`daily-tab-${tab.key}`} hidden={active !== tab.key} tabIndex={0}
    >
      {panels[tab.key]}
    </div>)}
  </div>
}

// The page-wide notices, said once here instead of under every card.
function DailyNotice() {
  return <section className="daily-notice" aria-label="안내">
    <b>안내</b>
    <ul>
      <li>이 화면은 정보를 전하기 위한 것이에요. 특정 상품의 가입·해지·매수를 권하지 않고, 금리·환율·주가가 앞으로 어떻게 될지 예측하지 않아요.</li>
      <li>적금을 계속 넣을지 해지할지는 각자 상황에 따라 다르니 직접 판단해 주세요.</li>
      <li>AI 표시가 있는 글은 AI가 공식 자료나 뉴스 제목·짧은 요약문을 보고 쓴 것이라 틀릴 수 있어요. 기사 전문은 가져오지 않으니 정확한 내용은 원문 링크에서 확인해 주세요.</li>
      <li>시장 지표는 한국은행 경제통계시스템(ECOS) 공식 통계이며 실시간 시세가 아니에요.</li>
      <li>다가올 일정은 각 기관이 공개한 날짜만 옮긴 것이며 결과를 예측하거나 정치적으로 해석하지 않아요.</li>
    </ul>
  </section>
}

function isTabKey(value: string | null): value is TabKey {
  return TABS.some((tab) => tab.key === value)
}

export function DailyPage() {
  const [data, setData] = useState<DailyBriefingResponse | null>(null)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [digest, setDigest] = useState<NewsDigest | null>(null)
  const [market, setMarket] = useState<MarketItem[]>([])
  const [events, setEvents] = useState<UpcomingEvent[] | null>([])
  const [searchParams, setSearchParams] = useSearchParams()
  const requested = searchParams.get('tab')
  const tab: TabKey = isTabKey(requested) ? requested : 'summary'

  function changeTab(key: TabKey) {
    setSearchParams(key === 'summary' ? {} : { tab: key }, { replace: true })
  }

  useEffect(() => {
    const controller = new AbortController()
    // No digest yet (404) or a failure hides the digest card and today's notes; everything else still shows.
    getNewsDigest(controller.signal).then(setDigest).catch(() => setDigest(null))
    // A market failure only hides the changed-indicator chips and the rate line.
    getMarket(controller.signal)
      .then((body) => setMarket(body.groups.flatMap((group) => group.items)))
      .catch(() => setMarket([]))
    getEvents(controller.signal).then((body) => setEvents(body.items)).catch((cause: unknown) => {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      setEvents(null)
    })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    getDaily(controller.signal).then(setData).catch((cause: unknown) => {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      setError(cause instanceof Error ? cause.message : '오늘의 브리핑을 불러오지 못했습니다.')
    })
    return () => controller.abort()
  }, [reloadKey])

  function retry() {
    setError('')
    setData(null)
    setReloadKey((key) => key + 1)
  }

  return (
    <section className="page page--wide daily-page">
      <p className="eyebrow">Daily money</p>
      <h1>오늘의 머니</h1>
      <p className="lead">오늘 경제 소식과 그 소식이 내 돈에 어떻게 닿는지 한곳에서 봐요.</p>

      {error && <ErrorNotice message={error} onRetry={retry} />}
      {!data && !error && <p className="notice">오늘의 브리핑을 불러오는 중입니다.</p>}

      {data && <>
        <TodayGlance
          date={data.date} generatedAt={data.generatedAt} digest={digest} market={market}
          nextEvent={events?.[0] ?? null} onShowEvents={() => changeTab('events')}
        />

        <DailyTabs active={tab} onChange={changeTab} panels={{
          summary: <>
            <NewsDigestCard digest={digest} />
            <MoneyContextCard digest={digest} market={market} />
            {data.items.length === 0
              ? <p className="daily-muted daily-empty">오늘 발행된 브리핑이 없습니다. 공식 자료가 없거나 검증을 통과한 요약이 없는 날입니다.</p>
              : <div className="daily-list">{data.items.map((item) => <BriefingCard key={item.id} item={item} />)}</div>}
          </>,
          news: <>
            {HEADLINE_REGIONS.map((entry) => <HeadlineList key={entry.region} {...entry} />)}
            <BokPressList />
          </>,
          events: <EventList events={events} />,
          term: <TermCard term={data.term} />,
        }} />

        <nav className="daily-links" aria-label="관련 계산 화면">
          <b>내 계산으로 이어서 보기</b>
          <Link className="button button--secondary" to="/conditions">내 조건 입력</Link>
          <Link className="button button--secondary" to="/cashflow">월별 납입 계획</Link>
          <Link className="button button--secondary" to="/alternatives">대안 비교</Link>
          <Link className="button button--secondary" to="/about">계산 기준</Link>
        </nav>
      </>}

      <DailyNotice />
    </section>
  )
}
