import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  calculateEarlyExit,
  getSavingsProducts,
  type EarlyExitResponse,
  type SavingsProductsResponse,
} from '../api/client'
import { ErrorNotice } from '../components/ErrorNotice'
import { track } from '../features/analytics'
import { defaultPaidMonths, gainLabel } from '../features/earlyExit'
import { answersForApi } from '../features/savingsDraft'
import { loadDraft } from '../storage/draftStorage'
import './EarlyExitPage.css'

const money = new Intl.NumberFormat('ko-KR')
const won = (value: number) => `${money.format(value)}원`
const DEFAULT_TERM_MONTHS = 36

export function EarlyExitPage() {
  const [draft] = useState(loadDraft)
  const [products, setProducts] = useState<SavingsProductsResponse | null>(null)
  const [productsError, setProductsError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [bank, setBank] = useState(draft.plan.currentBankCode ?? '')
  const [paidMonths, setPaidMonths] = useState(() => defaultPaidMonths(
    draft.plan.startMonth, draft.plan.enrollmentStatus === 'enrolled', DEFAULT_TERM_MONTHS))
  const [result, setResult] = useState<EarlyExitResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // 입력이 바뀐 뒤 늦게 온 이전 응답을 버리기 위한 요청 번호
  const requestId = useRef(0)

  useEffect(() => {
    const controller = new AbortController()
    getSavingsProducts(controller.signal).then((data) => {
      setProducts(data)
      setBank((current) => data.products.some((product) => product.bankCode === current) ? current : data.products[0]?.bankCode ?? '')
      setPaidMonths((current) => Math.min(current, data.policy.termMonths - 1))
    }).catch((cause: unknown) => {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      setProductsError(cause instanceof Error ? cause.message : '상품 정보를 불러오지 못했어요.')
    })
    return () => controller.abort()
  }, [reloadKey])

  function clearResult() {
    requestId.current += 1
    setResult(null)
    setError('')
    setLoading(false)
  }

  async function submit() {
    if (!products || !bank) return
    const termMonths = products.policy.termMonths
    const fixed = draft.plan.monthlyAmount ?? 500_000
    const amounts = Array.from({ length: termMonths }, (_, index) => draft.monthlyPayments[String(index + 1)] ?? fixed)
    const id = requestId.current + 1
    requestId.current = id
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const response = await calculateEarlyExit({
        bankCode: bank,
        monthlyAmounts: amounts,
        fixedMonthlyAmount: fixed,
        contributionType: draft.plan.contributionType ?? 'general',
        conditionAnswers: answersForApi(draft, products.products)[bank] ?? {},
        paidMonths,
      })
      if (requestId.current !== id) return
      setResult(response)
      track('check_early_exit')
    } catch (cause) {
      if (requestId.current === id) setError(cause instanceof Error ? cause.message : '해지 전 계산을 하지 못했어요.')
    } finally {
      if (requestId.current === id) setLoading(false)
    }
  }

  const termMonths = products?.policy.termMonths ?? DEFAULT_TERM_MONTHS
  // 저장값이 없어 가정한 값. 화면에 알려 실제 가입 정보처럼 보이지 않게 한다.
  const assumed = [
    draft.plan.monthlyAmount === undefined && '월 50만 원 납입',
    draft.plan.contributionType === undefined && '일반형 정부기여금',
    draft.plan.currentBankCode === undefined && '위에서 고른 은행',
    !(draft.plan.enrollmentStatus === 'enrolled' && draft.plan.startMonth) && '위에서 고른 회차',
  ].filter((item): item is string => Boolean(item))
  const pause = result?.scenarios.find((scenario) => scenario.key === 'pause')

  return (
    <section className="page page--wide early-exit">
      <p className="eyebrow">Before you cancel</p>
      <h1>해지 전 계산</h1>
      <p className="lead">적금을 지금 깨면 받는 돈과 잃는 것, 깨지 않고 버티는 방법을 나란히 보여 드려요.</p>

      {productsError && <ErrorNotice message={productsError} onRetry={() => { setProductsError(''); setReloadKey((key) => key + 1) }} />}
      {!products && !productsError && <p className="notice">상품 기준을 불러오는 중이에요.</p>}

      {products && <>
        <div className="cashflow-controls">
          <label>가입한 은행
            <select value={bank} onChange={(event) => { setBank(event.target.value); clearResult() }}>
              {products.products.map((product) => <option key={product.bankCode} value={product.bankCode}>{product.bankName}</option>)}
            </select>
          </label>
          <label>지금까지 낸 회차
            <select value={paidMonths} onChange={(event) => { setPaidMonths(Number(event.target.value)); clearResult() }}>
              {Array.from({ length: termMonths - 1 }, (_, index) => <option key={index} value={index + 1}>{index + 1}회차까지</option>)}
            </select>
          </label>
          <button className="button" type="button" disabled={loading || !bank} onClick={submit}>{loading ? '계산 중...' : '계산하기'}</button>
        </div>
        <p className="cashflow-help">회차별 금액은 <Link to="/cashflow">월별 납입 계획</Link>에 적은 값을, 우대조건과 기여금 유형은 <Link to="/conditions">내 조건</Link>의 답을 그대로 써요.</p>
        {assumed.length > 0 && <p className="notice" role="note">내 조건에 적은 값이 없어 {assumed.join(', ')}(으)로 계산해요. <Link to="/conditions">내 조건</Link>에서 바꿀 수 있어요.</p>}
      </>}

      {error && <ErrorNotice message={error} />}

      {result && <>
        <section className="early-exit__card early-exit__card--now" aria-labelledby="early-exit-now">
          <h2 id="early-exit-now">지금 해지하면 ({result.paidMonths}회차까지 내고 일반 중도해지)</h2>
          <p className="early-exit__headline">기본금리로 쳐도 받는 돈은 <b>{won(result.termination.receivedAtBaseRate)}</b>, 낸 돈 {won(result.termination.principal)}보다 <b>{gainLabel(result.termination.principal, result.termination.receivedAtBaseRate)}</b></p>
          <p className="cashflow-help">실제 중도해지 이율은 은행마다 따로 정해져 있고 보통 기본금리보다 낮아요. 그래서 실제로 받는 돈은 이보다 적을 수 있어요.</p>
          <dl className="money-breakdown">
            <div><dt>낸 원금</dt><dd>{won(result.termination.principal)}</dd></div>
            <div><dt>이자(기본금리로 계산)</dt><dd>{won(result.termination.interestAtBaseRate)}</dd></div>
            <div><dt>이자 세금 {result.interestTaxRate}%</dt><dd>-{won(result.termination.interestTax)}</dd></div>
          </dl>
          <h3>잃는 것</h3>
          <ul className="early-exit__losses">
            {result.termination.lostGovernmentContribution > 0 && <li>지금까지 쌓인 정부기여금 <b>{won(result.termination.lostGovernmentContribution)}</b>과 그 이자</li>}
            <li>{result.expectedRate > result.baseRate ? `우대금리: 예상금리 ${result.expectedRate}% 대신` : '금리:'} 은행이 정한 중도해지 이율(기본금리 {result.baseRate}%보다 낮은 경우가 많음)</li>
            <li>비과세: 이자에 {result.interestTaxRate}% 세금이 붙어요</li>
          </ul>
        </section>

        <section className="early-exit__card" aria-labelledby="early-exit-options">
          <h2 id="early-exit-options">해지하지 않으면</h2>
          {pause && <p className="early-exit__headline">남은 {result.monthsLeft}달을 한 푼도 안 넣고 두기만 해도 만기에 <b>{won(pause.expectedMaturityAmount)}</b>(낸 돈 {won(pause.principal)}보다 <b>{gainLabel(pause.principal, pause.expectedMaturityAmount)}</b>), 기본금리로 친 지금 해지 금액보다 <b>{won(pause.moreThanTermination)}</b> 더 받아요(낸 원금은 같음).</p>}
          <div className="cashflow-table-wrap">
            <table className="cashflow-table" aria-label="해지하지 않는 방법 비교">
              <thead><tr><th>방법</th><th>남은 달 납입</th><th>낸 원금</th><th>예상 만기 수령액</th><th>지금 해지보다</th></tr></thead>
              <tbody>{result.scenarios.map((scenario) => <tr key={scenario.key}>
                <th scope="row">{scenario.label}</th>
                <td>{scenario.futureMonthlyAmount === null ? '계획표대로' : `매달 ${won(scenario.futureMonthlyAmount)}`}</td>
                <td>{won(scenario.principal)}</td>
                <td>{won(scenario.expectedMaturityAmount)}</td>
                <td>{scenario.key === 'keep'
                  ? '원금이 달라 비교하지 않음'
                  : `+${won(scenario.moreThanTermination)}${scenario.extraPrincipal > 0 ? `(더 넣는 원금 ${won(scenario.extraPrincipal)} 포함)` : ''}`}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <p className="cashflow-help">원래 계획은 앞으로 낼 원금까지 들어 있어 지금 해지와 바로 비교하지 않아요. 최소 금액만 넣기는 남은 달에 넣는 소액만큼 원금이 조금 늘어요. 이번 달만 덜 넣거나 건너뛰는 계산은 <Link to="/cashflow">월별 납입 계획</Link>에 있어요.</p>
        </section>

        <details className="early-exit__card">
          <summary>이런 사유라면 특별중도해지가 될 수 있어요</summary>
          <p>아래 사유로 해지하면 은행에 따라 비과세 혜택과 정부기여금을 받을 수 있어요. 증빙 서류가 필요하니 가입 은행에 먼저 확인해 주세요.</p>
          <ul>{result.specialTerminationReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
          <p className="source-note">사유 목록 출처: <a href={result.specialTerminationSourceUrl} target="_blank" rel="noreferrer">{result.specialTerminationSource}</a>(확인일 {result.specialTerminationSourceDate}). 가입 은행의 사유와 다를 수 있어요.</p>
        </details>

        {result.unavailableNotes.map((note) => <p key={note} className="notice">추가 확인 필요: {note}</p>)}
        <p className="source-note">{result.bankName} 기본금리 {result.baseRate}% · 예상금리 {result.expectedRate}% · 공시 확인일 {result.sourceDate} · <a href={result.sourceUrl} target="_blank" rel="noreferrer">공시 원문</a> · 해지하라거나 하지 말라고 권하는 것이 아니라, 결정하기 전에 차이를 보여 드리는 예상치예요.</p>
      </>}
    </section>
  )
}
