import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getDaily, getNewsHeadlines,
  type DailyBriefingItem, type DailyBriefingResponse, type DailyTerm, type NewsHeadline,
} from '../api/client'
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

function TermCard({ term }: { term: DailyTerm | null }) {
  if (!term) {
    return <section className="daily-term" aria-labelledby="daily-term-title">
      <h2 id="daily-term-title">오늘의 금융용어</h2>
      <p className="daily-muted">오늘의 용어는 준비 중입니다.</p>
    </section>
  }
  return <section className="daily-term" aria-labelledby="daily-term-title">
    <h2 id="daily-term-title">오늘의 금융용어</h2>
    <p className="daily-term__name">{term.name}</p>
    {term.example.trim() && <p className="daily-term__easy"><b>쉽게 말하면</b> {term.example}</p>}
    <details className="daily-term__official">
      <summary>{term.example.trim() ? '공식 설명 보기' : '설명 보기'}</summary>
      <p className="daily-term__definition">{term.shortDefinition}</p>
    </details>
    {term.example.trim() && <p className="daily-muted">'쉽게 말하면'은 이해를 돕기 위해 따로 쓴 설명이고, 정확한 정의는 공식 설명을 따릅니다.</p>}
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

export function DailyPage() {
  const [data, setData] = useState<DailyBriefingResponse | null>(null)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

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

        {data.items.length === 0
          ? <p className="notice daily-empty">오늘 발행된 브리핑이 없습니다. 공식 자료가 없거나 검증을 통과한 요약이 없는 날입니다.</p>
          : <div className="daily-list">{data.items.map((item) => <BriefingCard key={item.id} item={item} />)}</div>}

        <TermCard term={data.term} />

        {HEADLINE_REGIONS.map((entry) => <HeadlineList key={entry.region} {...entry} />)}

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
