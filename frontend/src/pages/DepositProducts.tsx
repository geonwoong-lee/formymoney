import { useEffect, useState } from 'react'
import { getDepositProducts, type DepositGroup, type DepositProduct, type DepositProductsResponse } from '../api/client'

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

function ProductRow({ product }: { product: DepositProduct }) {
  const hasBonus = product.maxRate !== null && product.maxAfterTax !== null && Number(product.maxRate) > Number(product.baseRate)
  return <li className="deposit-product">
    <p className="deposit-product__name"><b>{product.company}</b> {product.productName} <span className="deposit-product__type">{product.rateType}</span></p>
    <p>기본금리 {percent(product.baseRate)} → 세후 <span className="deposit-product__amount">{won(product.baseAfterTax)}</span></p>
    {hasBonus && <p className="maturity-muted">우대 조건을 다 채우면 {percent(product.maxRate as string)} → 세후 {won(product.maxAfterTax as number)}</p>}
  </li>
}

// Step "실제 정기예금으로 보면": every disclosed fixed deposit for the chosen term, worked out on the server for
// the user's own amount. Listed by what the user would get, with the bonus-rate catch and protection limits said.
export function DepositProducts({ amount, months, headingId }: { amount: number; months: 12 | 24; headingId: string }) {
  const [group, setGroup] = useState<DepositGroup>('bank')
  const [sort, setSort] = useState<SortKey>('base')
  const [shownCount, setShownCount] = useState(PAGE)
  const [loaded, setLoaded] = useState<{ key: string; body: DepositProductsResponse | null } | null>(null)
  const key = `${amount}-${months}-${group}`
  const body = loaded?.key === key ? loaded.body : undefined

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      getDepositProducts({ amount, months, group }, controller.signal).then((response) => setLoaded({ key, body: response })).catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setLoaded({ key, body: null })
      })
    }, 250)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [amount, months, group, key])

  const products = body ? [...body.products].sort(SORTS[sort].compare) : []

  return <section className="maturity-step" aria-labelledby={headingId}>
    <h2 id={headingId}>4. 실제 정기예금으로 보면</h2>
    <p className="maturity-muted">위 예금 계산은 평균금리 하나로 본 거예요. 지금 공시된 {months}개월 정기예금에 {won(amount)}을 맡기면 만기에 세금 떼고 얼마를 받는지 상품마다 계산했어요.</p>
    <div className="deposit-controls">
      <div className="deposit-groups" role="radiogroup" aria-label="금융회사 종류">
        {GROUPS.map((item) => <label key={item.key} className={`maturity-profile${group === item.key ? ' maturity-profile--active' : ''}`}>
          <input type="radio" name={`${headingId}-group`} checked={group === item.key} onChange={() => { setGroup(item.key); setShownCount(PAGE) }} />
          <b>{item.label}</b>
        </label>)}
      </div>
      <label><span>보는 순서</span>
        <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
          {Object.entries(SORTS).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
        </select>
      </label>
    </div>

    {body === undefined && <p className="maturity-muted">공시 금리를 불러오는 중이에요.</p>}
    {body === null && <p className="maturity-muted">공시 금리를 불러오지 못했어요. 잠시 후 다시 확인해 주세요.</p>}
    {body && body.count === 0 && <p className="maturity-muted">아직 모은 {months}개월 정기예금 공시 금리가 없어요.</p>}
    {body && body.count > 0 && body.lowest && body.middle && body.highest && <>
      <dl className="deposit-range" aria-label="기본금리로 받는 돈의 범위">
        <div><dt>가장 적게</dt><dd>{won(body.lowest.afterTax)}<span>연 {percent(body.lowest.ratePercent)}</span></dd></div>
        <div><dt>가운데</dt><dd>{won(body.middle.afterTax)}<span>연 {percent(body.middle.ratePercent)}</span></dd></div>
        <div><dt>가장 많이</dt><dd>{won(body.highest.afterTax)}<span>연 {percent(body.highest.ratePercent)}</span></dd></div>
      </dl>
      <p className="maturity-muted">{body.group} 정기예금 {body.count.toLocaleString('ko-KR')}개(단리·복리 따로 셈)를 기본금리로 계산한 범위예요. 같은 돈이라도 어느 상품에 맡기느냐에 따라 받는 돈이 이만큼 달라져요.</p>
      <ul className="deposit-products" aria-label={`${body.group} 정기예금 목록`}>
        {products.slice(0, shownCount).map((product) => <ProductRow key={`${product.company}-${product.productName}-${product.rateType}`} product={product} />)}
      </ul>
      {shownCount < products.length && <button type="button" className="button button--secondary" onClick={() => setShownCount((count) => count + PAGE)}>
        {Math.min(PAGE, products.length - shownCount)}개 더 보기 ({shownCount}/{products.length})
      </button>}
      <ul className="deposit-notes">{body.notes.map((note) => <li key={note}>{note}</li>)}</ul>
      <p className="maturity-muted">출처 <a href={body.sourceUrl} target="_blank" rel="noreferrer">{body.sourceName} ↗</a>{body.day ? ` · ${formatDay(body.day)} 수집` : ''}</p>
    </>}
  </section>
}
