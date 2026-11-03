import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { formatKrwExact } from '../features/krw'
import { isWatched, loadWatchlist, MAX_WATCHED, toggleWatched, type WatchedProduct } from '../features/watchlist'
import { getDepositProducts, getSavingProducts, type RateContext, type DepositGroup, type DepositProduct, type DepositProductsResponse } from '../api/client'

const PAGE = 10
const won = (value: number) => `${value.toLocaleString('ko-KR')}원`
const percent = (value: string) => `${Number(value).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}%`

const GROUPS: { key: DepositGroup; label: string }[] = [
  { key: 'bank', label: '은행' },
  { key: 'savings_bank', label: '저축은행' },
]

const SORTS = {
  base: { label: '기본금리로 받는 돈 많은 순', compare: (a: DepositProduct, b: DepositProduct) => b.baseAfterTax - a.baseAfterTax },
  best: { label: '우대 조건 다 채우면 받는 돈 많은 순', compare: (a: DepositProduct, b: DepositProduct) => (b.maxAfterTax ?? b.baseAfterTax) - (a.maxAfterTax ?? a.baseAfterTax) },
  name: { label: '금융회사 이름순', compare: (a: DepositProduct, b: DepositProduct) => a.company.localeCompare(b.company, 'ko') || a.productName.localeCompare(b.productName, 'ko') },
} as const
type SortKey = keyof typeof SORTS

function formatDay(iso: string) {
  const [year, month, day] = iso.split('-').map(Number)
  return `${year}년 ${month}월 ${day}일`
}

// "해당사항 없음", "없음" and the like mean there is nothing to show.
const isEmpty = (text: string) => !text.trim() || /^(해당\s*사항\s*없음|없음|-)$/.test(text.trim())

function Terms({ product }: { product: DepositProduct }) {
  const rows: [string, string][] = [
    ['우대 조건', product.specialConditions],
    ['가입 대상', product.joinMember],
    ['가입 방법', product.joinWay.split(',').map((way) => way.trim()).filter(Boolean).join(', ')],
    ['가입 한도', product.maxLimit === null ? '' : `${formatKrwExact(product.maxLimit)}까지`],
    ['만기 후 이자', product.maturityInterest],
    ['그 밖의 안내', product.etcNote],
  ]
  const shown = rows.filter(([, text]) => !isEmpty(text))
  if (shown.length === 0) return null
  return <details className="deposit-terms">
    <summary>가입 조건 보기</summary>
    <dl>
      {shown.map(([label, text]) => <div key={label}><dt>{label}</dt><dd>{text}</dd></div>)}
    </dl>
    <p className="maturity-muted">은행이 금융감독원에 공시한 문장 그대로예요. 바뀌었을 수 있으니 가입 전에 은행에서 다시 확인해 주세요.</p>
  </details>
}

function ProductRow({ kind, product, watched, onToggle, full }: { kind: 'deposit' | 'saving'; product: DepositProduct; watched: boolean; onToggle: () => void; full: boolean }) {
  const hasBonus = product.maxRate !== null && product.maxAfterTax !== null && Number(product.maxRate) > Number(product.baseRate)
  const limited = product.joinLimit && product.joinLimit !== '제한 없음'
  return <li className="deposit-product">
    <div className="deposit-product__top">
      <p className="deposit-product__name"><b>{product.company}</b> {product.productName} <span className="deposit-product__type">{product.rateType}</span>{product.reserveType && <> <span className="deposit-product__type">{product.reserveType}</span></>}</p>
      {product.productCode && <Link className="deposit-watch" to={`/product?${new URLSearchParams({ kind, company: product.company, code: product.productCode }).toString()}`}>상세</Link>}
      {product.productCode && <button
        type="button" className="deposit-watch" aria-pressed={watched} onClick={onToggle} disabled={!watched && full}
        title={!watched && full ? `관심 상품은 ${MAX_WATCHED}개까지 둘 수 있어요` : undefined}
      >{watched ? '★ 관심 상품' : '☆ 관심'}</button>}
    </div>
    {(product.overLimit || limited) && <p className="deposit-product__flags">
      {product.overLimit && product.maxLimit !== null && <span className="deposit-flag deposit-flag--warn">한도 {formatKrwExact(product.maxLimit)}: 내 금액이 넘어요</span>}
      {limited && <span className="deposit-flag">{product.joinLimit}</span>}
    </p>}
    <p>기본금리 {percent(product.baseRate)} → 세후 <span className="deposit-product__amount">{won(product.baseAfterTax)}</span>{product.disclosedMonth && <span className="maturity-muted"> · 공시 {monthLabel(product.disclosedMonth)}</span>}</p>
    {hasBonus && <p className="maturity-muted">우대 조건을 다 채우면 {percent(product.maxRate as string)} → 세후 {won(product.maxAfterTax as number)}</p>}
    <Terms product={product} />
  </li>
}

const monthLabel = (period: string) => `${period.slice(0, 4)}.${period.slice(4, 6)}`

// Official figures next to the list so the rates can be read against them. Only the numbers are shown; no verdict.
function RateContextLine({ context, middleRate }: { context: RateContext; middleRate: string }) {
  const parts = [
    context.baseRate !== null && `한국은행 기준금리 ${percent(context.baseRate)}`,
    context.depositAverage !== null && context.depositAveragePeriod && `은행 신규 예금 평균금리 ${percent(context.depositAverage)}(${monthLabel(context.depositAveragePeriod)})`,
    context.inflation !== null && context.inflationPeriod && `소비자물가 상승률 ${percent(context.inflation)}(${monthLabel(context.inflationPeriod)})`,
  ].filter(Boolean)
  if (parts.length === 0) return null
  return <p className="maturity-muted deposit-context">
    참고로 {parts.join(', ')}이에요. 이 목록 가운데 상품의 금리는 {percent(middleRate)}예요. 평균은 우대조건이 없는 기준이라 상품 금리와 바로 견주기는 어려워요.
  </p>
}

interface ProductListProps {
  kind: 'deposit' | 'saving'
  noun: string  // 정기예금 / 적금
  headingId: string
  heading: string
  intro: ReactNode
  months: number
  loadKey: string  // changes whenever the inputs that decide the numbers change
  load: (group: DepositGroup, signal: AbortSignal) => Promise<DepositProductsResponse>
  extraControls?: ReactNode
}

// The disclosed products of one kind for the chosen inputs, worked out on the server for the user's own amount.
// Listed by what the user would get, with the bonus-rate catch and protection limits said.
export function ProductList({ kind, noun, headingId, heading, intro, months, loadKey, load, extraControls }: ProductListProps) {
  const [group, setGroup] = useState<DepositGroup>('bank')
  const [sort, setSort] = useState<SortKey>('base')
  const [shownCount, setShownCount] = useState(PAGE)
  const [loaded, setLoaded] = useState<{ key: string; body: DepositProductsResponse | null } | null>(null)
  const [watchlist, setWatchlist] = useState(() => loadWatchlist())
  const key = `${loadKey}-${group}`
  const body = loaded?.key === key ? loaded.body : undefined

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      load(group, controller.signal).then((response) => setLoaded({ key, body: response })).catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setLoaded({ key, body: null })
      })
    }, 250)
    return () => { window.clearTimeout(timer); controller.abort() }
    // `load` is rebuilt on every render; the key already says when the inputs changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, group])

  const products = body ? [...body.products].sort(SORTS[sort].compare) : []

  return <section className="maturity-step" aria-labelledby={headingId}>
    <h2 id={headingId}>{heading}</h2>
    <p className="maturity-muted">{intro}</p>
    <div className="deposit-controls">
      <div className="deposit-groups" role="radiogroup" aria-label="금융회사 종류">
        {GROUPS.map((item) => <label key={item.key} className={`maturity-profile${group === item.key ? ' maturity-profile--active' : ''}`}>
          <input type="radio" name={`${headingId}-group`} checked={group === item.key} onChange={() => { setGroup(item.key); setShownCount(PAGE) }} />
          <b>{item.label}</b>
        </label>)}
      </div>
      {extraControls}
      <label><span>보는 순서</span>
        <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
          {Object.entries(SORTS).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
        </select>
      </label>
    </div>

    {body === undefined && <p className="maturity-muted">공시 금리를 불러오는 중이에요.</p>}
    {body === null && <p className="maturity-muted">공시 금리를 불러오지 못했어요. 잠시 후 다시 확인해 주세요.</p>}
    {body && body.count === 0 && <p className="maturity-muted">아직 모은 {months}개월 {noun} 공시 금리가 없어요.</p>}
    {body && body.count > 0 && body.lowest && body.middle && body.highest && <>
      <dl className="deposit-range" aria-label="기본금리로 받는 돈의 범위">
        <div><dt>가장 적게</dt><dd>{won(body.lowest.afterTax)}<span>연 {percent(body.lowest.ratePercent)}</span></dd></div>
        <div><dt>가운데</dt><dd>{won(body.middle.afterTax)}<span>연 {percent(body.middle.ratePercent)}</span></dd></div>
        <div><dt>가장 많이</dt><dd>{won(body.highest.afterTax)}<span>연 {percent(body.highest.ratePercent)}</span></dd></div>
      </dl>
      <p className="maturity-muted">{body.group} {noun} {body.count.toLocaleString('ko-KR')}개(단리·복리 따로 셈)를 기본금리로 계산한 범위예요. 같은 돈이라도 어느 상품이냐에 따라 받는 돈이 이만큼 달라져요.
        {typeof body.principal === 'number' && ` 내가 넣는 원금은 ${won(body.principal)}이에요.`}</p>
      {body.context && <RateContextLine context={body.context} middleRate={body.middle.ratePercent} />}
      <ul className="deposit-products" aria-label={`${body.group} ${noun} 목록`}>
        {products.slice(0, shownCount).map((product) => {
          const item: WatchedProduct = { kind, company: product.company, productCode: product.productCode, productName: product.productName }
          return <ProductRow
            kind={kind} key={`${product.company}-${product.productName}-${product.rateType}-${product.reserveType}`} product={product}
            watched={isWatched(watchlist, item)} full={watchlist.length >= MAX_WATCHED}
            onToggle={() => setWatchlist((current) => toggleWatched(current, item))}
          />
        })}
      </ul>
      {shownCount < products.length && <button type="button" className="button button--secondary" onClick={() => setShownCount((count) => count + PAGE)}>
        {Math.min(PAGE, products.length - shownCount)}개 더 보기 ({shownCount}/{products.length})
      </button>}
      <p className="maturity-muted">☆ 관심을 누른 상품은 금리가 바뀌면 첫 화면과 오늘의 머니 위에 알려 드려요. 관심 상품은 이 기기에만 저장돼요.</p>
      <ul className="deposit-notes">{body.notes.map((note) => <li key={note}>{note}</li>)}</ul>
      <p className="maturity-muted">출처 <a href={body.sourceUrl} target="_blank" rel="noreferrer">{body.sourceName} ↗</a>{body.day ? ` · ${formatDay(body.day)} 수집` : ''}</p>
    </>}
  </section>
}

// Step "실제 정기예금으로 보면" of 만기 후 계획.
export function DepositProducts({ amount, months, headingId }: { amount: number; months: 12 | 24; headingId: string }) {
  return <ProductList
    kind="deposit" noun="정기예금" headingId={headingId} heading="4. 실제 정기예금으로 보면" months={months}
    intro={`위 예금 계산은 평균금리 하나로 본 거예요. 지금 공시된 ${months}개월 정기예금에 ${won(amount)}을 맡기면 만기에 세금 떼고 얼마를 받는지 상품마다 계산했어요.`}
    loadKey={`${amount}-${months}`} load={(group, signal) => getDepositProducts({ amount, months, group }, signal)}
  />
}

export type ReserveChoice = 'all' | 'fixed' | 'free'

// 일반 적금 비교: every disclosed regular savings plan for a monthly amount and term.
export function SavingProducts({ monthly, months, reserve, headingId }: { monthly: number; months: 6 | 12 | 24 | 36; reserve: ReserveChoice; headingId: string }) {
  return <ProductList
    kind="saving" noun="적금" headingId={headingId} heading="공시된 적금 비교" months={months}
    intro={`지금 공시된 ${months}개월 적금에 매달 ${won(monthly)}씩 넣으면 만기에 세금 떼고 얼마를 받는지 상품마다 계산했어요.`}
    loadKey={`${monthly}-${months}-${reserve}`} load={(group, signal) => getSavingProducts({ monthlyAmount: monthly, months, group, reserve }, signal)}
  />
}
