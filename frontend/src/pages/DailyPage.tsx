import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  getDaily, getMarket, getNewsDigest, getNewsHeadlines,
  type DailyBriefingItem, type DailyBriefingResponse, type DailyTerm, type DigestSource, type MarketItem, type MoneyNoteCategory,
  type NewsDigest, type NewsHeadline,
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
      <p className="daily-muted">정해진 규칙(관련 주제, 같은 소식을 다룬 언론 수, 발행 시각)으로 고른 것이며 AI 판단이나 투자·가입 권유가 아닙니다.</p>
    </div>}
    {items && items.length > 0 && <>
      <h3>전체 헤드라인</h3>
      <ul className="daily-headlines__list">
        {items.map((item) => <HeadlineItem key={item.url} item={item} />)}
      </ul>
      <p className="daily-muted">{region === 'international'
        ? `AI가 공식 원문을 한국어로 옮기고 요약한 내용이며 번역에 오류가 있을 수 있습니다. 출처: ${provider}. 정확한 내용은 원문에서 확인하세요.`
        : `제목과 링크만 보여 주며 AI가 요약하지 않습니다. 제공: ${provider}. 기사 내용은 원문에서 확인하세요.`}</p>
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
    <p className="daily-muted">{formatDate(digest.digestDate)} · <span className="daily-label daily-label--ai">AI 요약</span></p>
    <p className="daily-digest__overview">{digest.overview}</p>
    <ol className="daily-digest__points">
      {digest.points.map((point) => <li key={point.text}>
        <p>{point.text}</p>
        <SourceLinks sources={point.sources} />
      </li>)}
    </ol>
    <p className="daily-muted">뉴스 제목과 검색 API가 제공한 짧은 요약문만 보고 AI가 정리한 내용이라 틀릴 수 있습니다. 기사 전문은 가져오지 않으며, 정확한 내용은 링크한 원문에서 확인하세요. 투자·가입 권유가 아닙니다.</p>
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
    <p className="daily-muted">출처: 한국은행 보도자료. 제목과 원문 링크만 보여 주며 내용을 가져오거나 요약하지 않습니다. 자세한 내용은 한국은행 홈페이지 원문에서 확인하세요.</p>
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
    <p className="daily-muted"><span className="daily-label daily-label--ai">AI 정리</span> 뉴스 제목과 짧은 요약문만 보고 AI가 쓴 풀이라 틀릴 수 있어요. 원문도 함께 봐 주세요.</p>
  </>
}

function MoneyContextCard({ digest }: { digest: NewsDigest | null }) {
  const [rates, setRates] = useState<MarketItem[]>([])

  useEffect(() => {
    const controller = new AbortController()
    getMarket(controller.signal)
      .then((body) => setRates(body.groups.flatMap((group) => group.items).filter((item) => MONEY_RATE_CODES.includes(item.code))))
      .catch(() => setRates([]))
    return () => controller.abort()
  }, [])

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
    <h3 id="daily-context-basics">금리가 움직이면 보통 이렇게 돼요</h3>
    <ul className="daily-context__points" aria-labelledby="daily-context-basics">
      <li><b>새로 적금에 들 때</b> 기준금리가 오르면 은행이 새로 내놓는 예금과 적금의 이자도 대개 같이 올라요. 기준금리가 내려가면 새 상품의 이자도 낮아지는 일이 많아요.</li>
      <li><b>이미 넣고 있는 적금</b> 대부분은 가입한 날 정한 이자율이 만기까지 그대로 가요. 그래서 기준금리가 바뀌어도 내 적금 이자는 그대로인 경우가 많아요. 중간에 이자율이 바뀌는 상품도 있으니, 가입할 때 받은 상품 설명서를 한번 꺼내 보세요.</li>
      <li><b>빌린 돈이 있을 때</b> 변동금리 대출은 금리가 오르면 매달 내는 이자도 늘어날 수 있어요.</li>
      <li><b>이번 달 덜 넣거나 쉬고 싶을 때</b> 한 달을 덜 넣거나 건너뛰면 만기에 받는 돈이 줄어들 수 있어요. 덜 넣거나 건너뛰었을 때 얼마나 달라지는지는 아래 버튼을 눌러 내 숫자로 계산해 볼 수 있어요. 아예 만기 전에 해지하면 약속받았던 우대금리나 정부가 보태 주는 돈을 못 받을 수 있는데, 해지할 때 받는 돈은 여기서 계산하지 않으니 가입한 은행에서 확인해 주세요.</li>
    </ul>
    <p className="daily-context__links">
      <Link className="button button--secondary" to="/cashflow">이번 달 납입이 달라지면? 계산하기</Link>
      <Link className="button button--secondary" to="/market">시장 지표 더 보기</Link>
    </p>
    <p className="daily-muted">오늘 소식 풀이와 아래 설명은 금리가 보통 어떻게 움직이는지 설명한 것이고, 앞으로 금리가 오를지 내릴지 예측하지 않아요. 적금을 계속 넣을지 해지할지는 각자 상황에 따라 다르니 직접 판단해 주세요. 가입이나 해지를 권하는 내용이 아니에요.</p>
  </section>
}

export function DailyPage() {
  const [data, setData] = useState<DailyBriefingResponse | null>(null)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [digest, setDigest] = useState<NewsDigest | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    // No digest yet (404) or a failure hides the digest card and today's notes; everything else still shows.
    getNewsDigest(controller.signal).then(setDigest).catch(() => setDigest(null))
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
      <p className="lead">금융위원회가 공개한 공식 자료를 AI가 쉽게 풀어쓴 요약입니다. 특정 상품의 가입·매수를 권유하지 않으며 미래 수익을 예측하지 않습니다.</p>

      {error && <ErrorNotice message={error} onRetry={retry} />}
      {!data && !error && <p className="notice">오늘의 브리핑을 불러오는 중입니다.</p>}

      {data && <>
        <p className="daily-date">
          <b>{formatDate(data.date)}</b>
          {data.generatedAt && <span> · 최종 갱신 {formatGenerated(data.generatedAt)}</span>}
        </p>

        <NewsDigestCard digest={digest} />
        <MoneyContextCard digest={digest} />

        {data.items.length === 0
          ? <p className="notice daily-empty">오늘 발행된 브리핑이 없습니다. 공식 자료가 없거나 검증을 통과한 요약이 없는 날입니다.</p>
          : <div className="daily-list">{data.items.map((item) => <BriefingCard key={item.id} item={item} />)}</div>}

        <TermCard term={data.term} />

        {HEADLINE_REGIONS.map((entry) => <HeadlineList key={entry.region} {...entry} />)}

        <BokPressList />

        <nav className="daily-links" aria-label="관련 계산 화면">
          <b>내 계산으로 이어서 보기</b>
          <Link className="button button--secondary" to="/conditions">내 조건 입력</Link>
          <Link className="button button--secondary" to="/cashflow">월별 납입 계획</Link>
          <Link className="button button--secondary" to="/alternatives">대안 비교</Link>
          <Link className="button button--secondary" to="/about">계산 기준</Link>
        </nav>
      </>}
    </section>
  )
}
