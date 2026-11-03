import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { getLoanProducts, type DepositGroup, type LoanProduct, type LoanProductsResponse } from '../api/client'
import { MoneyInput } from '../components/MoneyInput'
import { loadDraft } from '../storage/draftStorage'
import './MaturityPage.css'

const MIN_PRINCIPAL = 1_000_000
const MAX_PRINCIPAL = 3_000_000_000
const MIN_MONTHS = 6
const MAX_MONTHS = 120
const PAGE = 10
const won = (value: number) => `${value.toLocaleString('ko-KR')}원`
const percent = (value: string) => `연 ${Number(value).toFixed(2)}%`
const range = (low: number, high: number) => (low === high ? won(low) : `${won(low)} ~ ${won(high)}`)
const rateRange = (product: LoanProduct) => (product.rateMin === product.rateMax ? percent(product.rateMin) : `${percent(product.rateMin)} ~ ${Number(product.rateMax).toFixed(2)}%`)

type Repay = 'all' | 'interest_only' | 'instalment'
type RateType = 'all' | 'fixed' | 'variable'
type Guarantee = 'all' | 'sgi' | 'hf' | 'hug'

interface Budget {
  savings: number  // what the visitor already puts into savings each month, 0 when unknown
  income: number | null  // monthly take-home pay, only when typed
}

function BudgetLines({ product, budget }: { product: LoanProduct; budget: Budget }) {
  if (budget.savings === 0 && budget.income === null) return null
  const low = product.monthlyMin + budget.savings
  const high = product.monthlyMax + budget.savings
  return <>
    {budget.savings > 0 && <p className="maturity-muted">내 적금 {won(budget.savings)}을 더하면 매달 나가는 돈 {range(low, high)}</p>}
    {budget.income !== null && <p className="maturity-muted">월 소득 {won(budget.income)}에서 빼면 {budget.income - high >= 0
      ? `${range(budget.income - high, budget.income - low)} 남아요`
      : `${won(high - budget.income)}${low > budget.income ? ' ~ ' + won(low - budget.income) : ''}이 모자라요`}</p>}
  </>
}

function Row({ product, budget }: { product: LoanProduct; budget: Budget }) {
  return <li className="deposit-product">
    <p className="deposit-product__name"><b>{product.company}</b> {product.productName} <span className="deposit-product__type">{product.rateType}</span> <span className="deposit-product__type">{product.repayType}</span>{product.guarantee && <> <span className="deposit-product__type">{product.guarantee} 보증</span></>}</p>
    <p>금리 {rateRange(product)}</p>
    <p>{product.monthlyLabel} <span className="deposit-product__amount">{range(product.monthlyMin, product.monthlyMax)}</span></p>
    <p>총이자 <span className="deposit-product__amount">{range(product.totalInterestMin, product.totalInterestMax)}</span></p>
    <BudgetLines product={product} budget={budget} />
    <details className="deposit-terms">
      <summary>한도·수수료·가입 방법</summary>
      <dl>
        {product.loanLimit && <><dt>대출 한도</dt><dd>{product.loanLimit}</dd></>}
        {product.joinWay && <><dt>가입 방법</dt><dd>{product.joinWay}</dd></>}
        {product.earlyRepayFee && <><dt>중도상환수수료</dt><dd className="deposit-terms__text">{product.earlyRepayFee}</dd></>}
        {product.delayRate && <><dt>연체 이자율</dt><dd className="deposit-terms__text">{product.delayRate}</dd></>}
      </dl>
    </details>
  </li>
}

// 전세자금대출 비교: the disclosed rent deposit loans, worked out for the visitor's own amount and term on the server.
// Both ends of the disclosed rate are shown because the lender sets the final one.
export function RentLoansPage() {
  const id = useId()
  const [principal, setPrincipal] = useState<number | null>(100_000_000)
  const [months, setMonths] = useState<number | null>(24)
  const [group, setGroup] = useState<DepositGroup>('bank')
  const [repay, setRepay] = useState<Repay>('all')
  const [rateType, setRateType] = useState<RateType>('all')
  const [guarantee, setGuarantee] = useState<Guarantee>('all')
  const [income, setIncome] = useState<number | null>(null)
  const [savings] = useState(() => loadDraft().plan.monthlyAmount ?? 0)
  const [shown, setShown] = useState(PAGE)
  const [loaded, setLoaded] = useState<{ key: string; body: LoanProductsResponse | null } | null>(null)
  const principalValue = principal ?? 0
  const monthsValue = months ?? 0
  const invalid = !Number.isInteger(principalValue) || principalValue < MIN_PRINCIPAL || principalValue > MAX_PRINCIPAL
    || !Number.isInteger(monthsValue) || monthsValue < MIN_MONTHS || monthsValue > MAX_MONTHS
  const key = `${principalValue}-${monthsValue}-${group}-${repay}-${rateType}-${guarantee}`
  const body = loaded?.key === key ? loaded.body : undefined

  useEffect(() => {
    if (invalid) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      getLoanProducts({ principal: principalValue, months: monthsValue, group, repay, rateType, guarantee }, controller.signal)
        .then((response) => setLoaded({ key, body: response }))
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === 'AbortError') return
          setLoaded({ key, body: null })
        })
    }, 250)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [key, invalid, principalValue, monthsValue, group, repay, rateType, guarantee])

  return <section className="page page--wide maturity-page">
    <p className="eyebrow">Rent deposit loans</p>
    <h1>전세자금대출 비교</h1>
    <p className="lead">전세 보증금을 빌릴 때 공시된 대출마다 이자를 얼마나 내는지 같은 기준으로 볼 수 있어요. 어떤 대출을 받으라고 권하지는 않아요.</p>

    <section className="maturity-step" aria-labelledby={`${id}-inputs`}>
      <h2 id={`${id}-inputs`}>1. 얼마를 얼마나 빌릴까요?</h2>
      <div className="maturity-inputs">
        <label><span>빌릴 돈(원)</span><MoneyInput value={principal} onValueChange={setPrincipal} aria-invalid={invalid} /></label>
        <label><span>기간(개월)</span>
          <input type="number" inputMode="numeric" min={MIN_MONTHS} max={MAX_MONTHS} value={months ?? ''} onChange={(event) => { setMonths(event.target.value === '' ? null : Number(event.target.value)); setShown(PAGE) }} />
        </label>
        <label><span>어디서</span>
          <select value={group} onChange={(event) => { setGroup(event.target.value as DepositGroup); setShown(PAGE) }}>
            <option value="bank">은행</option>
            <option value="savings_bank">저축은행</option>
          </select>
        </label>
        <label><span>갚는 방식</span>
          <select value={repay} onChange={(event) => { setRepay(event.target.value as Repay); setShown(PAGE) }}>
            <option value="all">모두</option>
            <option value="interest_only">만기일시상환(이자만 내다 만기에 원금)</option>
            <option value="instalment">분할상환(원금과 이자를 나눠서)</option>
          </select>
        </label>
        <label><span>금리 방식</span>
          <select value={rateType} onChange={(event) => { setRateType(event.target.value as RateType); setShown(PAGE) }}>
            <option value="all">모두</option>
            <option value="fixed">고정금리</option>
            <option value="variable">변동금리</option>
          </select>
        </label>
        <label><span>보증기관</span>
          <select value={guarantee} onChange={(event) => { setGuarantee(event.target.value as Guarantee); setShown(PAGE) }}>
            <option value="all">모두</option>
            <option value="sgi">서울보증보험(SGI)</option>
            <option value="hf">주택금융공사(HF)</option>
            <option value="hug">주택도시보증공사(HUG)</option>
          </select>
        </label>
        <label><span>월 소득(원, 선택)</span><MoneyInput value={income} onValueChange={setIncome} /></label>
      </div>
      <p className="maturity-muted">월 소득을 넣으면 월 상환액과 내 적금 납입을 뺀 돈이 얼마 남는지 보여 줘요. 이 기기에서만 계산하고 저장하지 않아요.</p>
      {invalid && <p className="maturity-error" role="alert">빌릴 돈은 {won(MIN_PRINCIPAL)}부터 {won(MAX_PRINCIPAL)}까지, 기간은 {MIN_MONTHS}~{MAX_MONTHS}개월로 넣어 주세요.</p>}
    </section>

    {!invalid && <section className="maturity-step" aria-labelledby={`${id}-products`}>
      <h2 id={`${id}-products`}>공시된 전세자금대출</h2>
      {body === undefined && <p className="maturity-muted">공시 금리를 불러오는 중이에요.</p>}
      {body === null && <p className="maturity-muted">공시 금리를 불러오지 못했어요. 잠시 후 다시 확인해 주세요.</p>}
      {body && body.count === 0 && <p className="maturity-muted">고른 조건에 맞는 공시 대출이 없어요. 조건을 바꿔 보세요.</p>}
      {body && body.count > 0 && <>
        <p className="maturity-muted">{body.group} 전세자금대출 {body.count.toLocaleString('ko-KR')}개를 {won(body.principal)} · {body.months}개월 기준으로 계산했어요. 총이자가 적은 순서예요.</p>
        <ul className="deposit-products" aria-label={`${body.group} 전세자금대출 목록`}>
          {body.products.slice(0, shown).map((product) => <Row key={`${product.company}-${product.productCode}-${product.repayType}-${product.rateType}`} product={product} budget={{ savings, income }} />)}
        </ul>
        {shown < body.products.length && <button type="button" className="button button--secondary" onClick={() => setShown((count) => count + PAGE)}>
          {Math.min(PAGE, body.products.length - shown)}개 더 보기 ({shown}/{body.products.length})
        </button>}
        <ul className="deposit-notes">{body.notes.map((note) => <li key={note}>{note}</li>)}</ul>
        <p className="maturity-muted">출처 <a href={body.sourceUrl} target="_blank" rel="noreferrer">{body.sourceName} ↗</a>{body.day ? ` · ${body.day.replaceAll('-', '.')} 수집` : ''}</p>
      </>}
    </section>}

    <nav className="maturity-links" aria-label="관련 화면">
      <Link className="button button--secondary" to="/general-savings">일반 적금 비교</Link>
      <Link className="button button--secondary" to="/maturity">만기 후 계획</Link>
    </nav>
  </section>
}
