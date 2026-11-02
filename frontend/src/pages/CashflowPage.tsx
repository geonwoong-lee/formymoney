import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  calculateCashflow,
  calculateMonthImpact,
  getSavingsProducts,
  type CashflowCalculationResponse,
  type MonthImpactResponse,
  type SavingsProductsResponse,
} from '../api/client'
import { ErrorNotice } from '../components/ErrorNotice'
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
  const [reloadKey, setReloadKey] = useState(0)
  const [impactMonth, setImpactMonth] = useState(1)
  const [impactReduced, setImpactReduced] = useState(250_000)
  const [impact, setImpact] = useState<MonthImpactResponse | null>(null)
  const [impactError, setImpactError] = useState('')
  const [impactLoading, setImpactLoading] = useState(false)
  // 입력이 바뀐 뒤 늦게 도착한 이전 영향 계산 응답을 버리기 위한 요청 번호.
  const impactRequestId = useRef(0)

  function clearImpact() {
    impactRequestId.current += 1
    setImpact(null)
    setImpactError('')
    setImpactLoading(false)
  }

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
  }, [draft.plan.monthlyAmount, reloadKey])

  function retryProducts() {
    setError('')
    setReloadKey((key) => key + 1)
  }

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

  const impactOriginal = amounts[impactMonth - 1] ?? 0
  const impactReducedError = impactReduced < minimumAmount || impactReduced >= impactOriginal || impactReduced % 1_000 !== 0
    ? (impactOriginal <= minimumAmount
      ? `${impactMonth}회차 납입액이 ${money.format(impactOriginal)}원이라 더 줄일 수 없습니다.`
      : `감액 금액은 ${money.format(minimumAmount)}원 이상 1,000원 단위로, 원래 납입액(${money.format(impactOriginal)}원)보다 작아야 합니다.`)
    : ''

  function updateAmount(index: number, value: number) {
    setResult(null)
    clearImpact()
    setError('')
    setAmounts((current) => current.map((amount, itemIndex) => itemIndex === index ? value : amount))
  }

  function applyToFuture() {
    setResult(null)
    clearImpact()
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

  async function submitImpact() {
    if (!products || !selectedBank) return
    const requestId = impactRequestId.current + 1
    impactRequestId.current = requestId
    setImpactLoading(true)
    setImpactError('')
    setImpact(null)
    try {
      const allAnswers = answersForApi(draft, products.products)
      const response = await calculateMonthImpact({
        bankCode: selectedBank,
        monthlyAmounts: amounts,
        fixedMonthlyAmount: draft.plan.monthlyAmount ?? 500_000,
        contributionType: draft.plan.contributionType ?? 'general',
        conditionAnswers: allAnswers[selectedBank] ?? {},
        monthNumber: impactMonth,
        reducedAmount: impactReduced,
      })
      if (impactRequestId.current === requestId) setImpact(response)
    } catch (cause) {
      if (impactRequestId.current === requestId) {
        setImpactError(cause instanceof Error ? cause.message : '한 달 변경 영향을 계산하지 못했습니다.')
      }
    } finally {
      if (impactRequestId.current === requestId) setImpactLoading(false)
    }
  }

  return (
    <section className="page page--wide cashflow-page">
      <p className="eyebrow">Cash flow</p>
      <h1>월별 납입 계획</h1>
      <p className="lead">덜 넣은 달과 쉬어간 달까지 반영해 실제에 가까운 만기 금액을 확인하세요.</p>

      {error && <ErrorNotice message={error} onRetry={products ? undefined : retryProducts} />}
      {!products && !error && <p className="notice">상품 기준을 불러오는 중입니다.</p>}

      {products && <>
        <div className="cashflow-controls">
          <label>계산할 은행
            <select value={selectedBank} onChange={(event) => { setSelectedBank(event.target.value); setResult(null); clearImpact() }}>
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

      {products && invalidMonthIndices.length === 0 && <section className="cashflow-result" aria-label="한 달 변경 영향">
        <h2>이번 달 납입이 달라지면?</h2>
        <p className="cashflow-help">위 표의 나머지 달은 그대로 두고, 선택한 한 달만 유지·감액·미납했을 때 예상 만기액이 얼마나 달라지는지 비교합니다.</p>
        <div className="cashflow-controls">
          <label>비교할 회차
            <select value={impactMonth} onChange={(event) => { setImpactMonth(Number(event.target.value)); clearImpact() }}>
              {amounts.map((_, index) => <option key={index} value={index + 1}>{monthLabel(draft.plan.startMonth, index)} ({index + 1}회차)</option>)}
            </select>
          </label>
          <label>감액했을 때 금액
            <input type="number" min={minimumAmount} max={Math.max(minimumAmount, impactOriginal - 1)} step="1000" value={impactReduced} aria-invalid={impactReducedError !== ''} onChange={(event) => { setImpactReduced(Number(event.target.value)); clearImpact() }} />
            {impactReducedError && <span className="field-error">{impactReducedError}</span>}
          </label>
          <button className="button button--secondary" type="button" disabled={impactLoading || impactReducedError !== ''} onClick={submitImpact}>{impactLoading ? '계산 중...' : '세 가지 비교하기'}</button>
        </div>
        {impactError && <ErrorNotice message={impactError} />}
        {impact && <>
          <table className="cashflow-table" aria-label="한 달 변경 영향 비교">
            <thead><tr><th>구분</th><th>그 달 납입액</th><th>예상 만기 수령액</th><th>원래대로 대비 만기액</th><th>이자 차이</th><th>정부기여금 차이</th></tr></thead>
            <tbody>{impact.scenarios.map((scenario) => <tr key={scenario.key}>
              <th scope="row">{scenario.label}</th>
              <td>{money.format(scenario.monthAmount)}원</td>
              <td>{money.format(scenario.expectedMaturityAmount)}원</td>
              <td className={scenario.differenceFromKeep < 0 ? 'difference--minus' : ''}>{scenario.differenceFromKeep > 0 ? '+' : ''}{money.format(scenario.differenceFromKeep)}원</td>
              <td>{scenario.depositInterestDifferenceFromKeep > 0 ? '+' : ''}{money.format(scenario.depositInterestDifferenceFromKeep)}원</td>
              <td>{scenario.governmentContributionDifferenceFromKeep > 0 ? '+' : ''}{money.format(scenario.governmentContributionDifferenceFromKeep)}원</td>
            </tr>)}</tbody>
          </table>
          {impact.unavailableNotes.map((note) => <p key={note} className="notice">추가 확인 필요: {note}</p>)}
          <p className="source-note">{impact.bankName} 예상금리 {impact.expectedRate}% · 공시 확인일 {impact.sourceDate} · <a href={impact.sourceUrl} target="_blank" rel="noreferrer">공시 원문</a> · 차이를 보여 주는 예상치이며 어떤 선택을 권하는 것이 아닙니다. 개인별 세금과 은행의 최종 심사는 반영하지 않았습니다.</p>
        </>}
      </section>}

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
        <p className="source-note">예상금리 {result.result.expectedRate}% · 공시 확인일 {result.result.sourceDate} · <a href={result.result.sourceUrl} target="_blank" rel="noreferrer">공시 원문</a> · 모든 금액은 입력값과 현재 상품 기준으로 계산한 예상치이며 개인별 세금, 은행의 최종 서류 심사와 공시 이후 바뀐 조건은 반영하지 않았습니다.</p>
        <div className="actions"><Link className="button" to="/alternatives">같은 돈으로 대안 비교하기</Link></div>
      </section>}
    </section>
  )
}
