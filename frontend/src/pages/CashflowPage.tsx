import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  calculateCashflow,
  getSavingsProducts,
  type CashflowCalculationResponse,
  type SavingsProductsResponse,
} from '../api/client'
import { answersForApi } from '../features/savingsDraft'
import { loadDraft, saveDraft } from '../storage/draftStorage'

const money = new Intl.NumberFormat('ko-KR')
const DEFAULT_TERM_MONTHS = 36

function initialAmounts(termMonths: number) {
  const draft = loadDraft()
  const baseAmount = draft.plan.monthlyAmount ?? 500_000
  return Array.from({ length: termMonths }, (_, index) => draft.monthlyPayments[String(index + 1)] ?? baseAmount)
}

function monthLabel(startMonth: string | undefined, index: number) {
  if (!startMonth) return `${index + 1}개월차`
  const [year, month] = startMonth.split('-').map(Number)
  const target = new Date(year, month - 1 + index, 1)
  return `${target.getFullYear()}년 ${target.getMonth() + 1}월`
}

function isActualMonth(startMonth: string | undefined, enrollmentStatus: string | undefined, index: number) {
  if (enrollmentStatus !== 'enrolled' || !startMonth) return false
  const [year, month] = startMonth.split('-').map(Number)
  const target = new Date(year, month - 1 + index, 1)
  const now = new Date()
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  return target <= currentMonth
}

export function CashflowPage() {
  const [draft, setDraft] = useState(loadDraft)
  const [products, setProducts] = useState<SavingsProductsResponse | null>(null)
  const [selectedBank, setSelectedBank] = useState(draft.plan.currentBankCode ?? '')
  const [amounts, setAmounts] = useState(() => initialAmounts(DEFAULT_TERM_MONTHS))
  const [futureAmount, setFutureAmount] = useState(draft.plan.monthlyAmount ?? 500_000)
  const [result, setResult] = useState<CashflowCalculationResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    getSavingsProducts(controller.signal).then((data) => {
      setProducts(data)
      setSelectedBank((current) => data.products.some((product) => product.bankCode === current)
        ? current
        : data.products[0]?.bankCode ?? '')
      setAmounts((current) => Array.from(
        { length: data.policy.termMonths },
        (_, index) => current[index] ?? draft.plan.monthlyAmount ?? 500_000,
      ))
    }).catch((cause: unknown) => {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      setError(cause instanceof Error ? cause.message : '상품 정보를 불러오지 못했습니다.')
    })
    return () => controller.abort()
  }, [draft.plan.monthlyAmount])

  useEffect(() => {
    const nextDraft = {
      ...draft,
      monthlyPayments: Object.fromEntries(amounts.map((amount, index) => [String(index + 1), amount])),
    }
    saveDraft(nextDraft)
    setDraft(nextDraft)
    // This effect owns monthly payment persistence; other draft changes must not retrigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amounts])

  const actualMonths = useMemo(() => amounts.map((_, index) => isActualMonth(
    draft.plan.startMonth,
    draft.plan.enrollmentStatus,
    index,
  )), [amounts, draft.plan.enrollmentStatus, draft.plan.startMonth])
  const minimumAmount = products?.policy.minimumMonthlyAmount ?? 1_000
  const maximumAmount = products?.policy.maximumMonthlyAmount ?? 500_000
  const invalidMonthIndices = useMemo(() => amounts
    .map((amount, index) => (amount < 0 || amount > maximumAmount || (amount !== 0 && amount < minimumAmount)) ? index : -1)
    .filter((index) => index >= 0), [amounts, maximumAmount, minimumAmount])

  function updateAmount(index: number, value: number) {
    setResult(null)
    setError('')
    setAmounts((current) => current.map((amount, itemIndex) => itemIndex === index ? value : amount))
  }

  function applyToFuture() {
    setResult(null)
    setAmounts((current) => current.map((amount, index) => actualMonths[index] ? amount : futureAmount))
  }

  async function submit() {
    if (!products || !selectedBank) return
    if (invalidMonthIndices.length > 0) {
      setError(`표시된 달에는 0원 또는 ${money.format(minimumAmount)}원부터 ${money.format(maximumAmount)}원까지 입력하세요.`)
      return
    }
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const allAnswers = answersForApi(draft, products.products)
      setResult(await calculateCashflow({
        bankCode: selectedBank,
        monthlyAmounts: amounts,
        fixedMonthlyAmount: draft.plan.monthlyAmount ?? 500_000,
        contributionType: draft.plan.contributionType ?? 'general',
        conditionAnswers: allAnswers[selectedBank] ?? {},
      }))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '월별 납입 결과를 계산하지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="page page--wide cashflow-page">
      <p className="eyebrow">Cash flow</p>
      <h1>월별 납입 계획</h1>
      <p className="lead">덜 넣은 달과 쉬어간 달까지 반영해 실제에 가까운 만기 금액을 확인하세요.</p>

      {error && <p className="notice notice--error">{error}</p>}
      {!products && !error && <p className="notice">상품 기준을 불러오는 중입니다.</p>}

      {products && <>
        <div className="cashflow-controls">
          <label>계산할 은행
            <select value={selectedBank} onChange={(event) => { setSelectedBank(event.target.value); setResult(null) }}>
              {products.products.map((product) => <option key={product.bankCode} value={product.bankCode}>{product.bankName}</option>)}
            </select>
          </label>
          <label>앞으로 넣을 금액
            <input type="number" min="0" max={maximumAmount} step="1000" value={futureAmount} onChange={(event) => setFutureAmount(Number(event.target.value))} />
          </label>
          <button className="button button--secondary" type="button" onClick={applyToFuture}>앞으로 모든 달에 같은 금액 적용</button>
        </div>

        <p className="cashflow-help"><b>실제</b>는 이미 지난 납입 월, <b>계획</b>은 앞으로의 월입니다. 미납한 달은 0원을 입력하세요.</p>
        <div className="cashflow-table-wrap">
          <table className="cashflow-table">
            <thead><tr><th>회차</th><th>구분</th><th>납입액</th></tr></thead>
            <tbody>{amounts.map((amount, index) => <tr key={index} className={`${actualMonths[index] ? 'cashflow-row--actual' : ''} ${invalidMonthIndices.includes(index) ? 'cashflow-row--invalid' : ''}`}>
              <th scope="row">{monthLabel(draft.plan.startMonth, index)}</th>
              <td><span className={`cashflow-badge ${actualMonths[index] ? 'cashflow-badge--actual' : ''}`}>{actualMonths[index] ? '실제' : '계획'}</span></td>
              <td><label className="sr-only" htmlFor={`payment-${index}`}>{index + 1}개월차 납입액</label><input id={`payment-${index}`} type="number" min="0" max={maximumAmount} step="1000" value={amount} aria-invalid={invalidMonthIndices.includes(index)} onChange={(event) => updateAmount(index, Number(event.target.value))} />{invalidMonthIndices.includes(index) && <span className="field-error">금액 확인 필요</span>}</td>
            </tr>)}</tbody>
            <tfoot><tr><th colSpan={2}>총 납입원금</th><td>{money.format(amounts.reduce((sum, amount) => sum + amount, 0))}원</td></tr></tfoot>
          </table>
        </div>

        <div className="actions actions--sticky">
          <button className="button" type="button" disabled={loading || invalidMonthIndices.length > 0} onClick={submit}>{loading ? '계산 중...' : '월별 금액으로 다시 계산'}</button>
          <Link className="button button--secondary" to="/banks">은행 비교로 돌아가기</Link>
        </div>
      </>}

      {result && <section className="cashflow-result" aria-label="월별 납입 계산 결과">
        <h2>{result.result.bankName} 예상 결과</h2>
        <dl className="money-breakdown">
          <div><dt>총 납입원금</dt><dd>{money.format(result.result.principal)}원</dd></div>
          <div><dt>예상 이자</dt><dd>{money.format(result.result.depositInterest)}원</dd></div>
          <div><dt>정부기여금</dt><dd>{money.format(result.result.governmentContribution)}원</dd></div>
          <div><dt>기여금 예상 이자</dt><dd>{money.format(result.result.governmentContributionInterest)}원</dd></div>
          <div><dt>예상 만기 수령액</dt><dd>{money.format(result.result.expectedMaturityAmount)}원</dd></div>
          <div><dt>매달 기본금액 납입 대비</dt><dd className={result.differenceFromFixedPlan < 0 ? 'difference--minus' : 'difference--plus'}>{result.differenceFromFixedPlan > 0 ? '+' : ''}{money.format(result.differenceFromFixedPlan)}원</dd></div>
        </dl>
        <p className="source-note">예상금리 {result.result.expectedRate}% · 모든 금액은 입력값과 현재 상품 기준으로 계산한 예상치입니다.</p>
      </section>}
    </section>
  )
}
