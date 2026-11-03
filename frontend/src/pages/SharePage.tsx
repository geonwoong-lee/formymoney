import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { calculateSavings, getSavingsProducts, type SavingsCalculationResponse } from '../api/client'
import { ErrorNotice } from '../components/ErrorNotice'
import { track } from '../features/analytics'
import { answersForApi } from '../features/savingsDraft'
import { decodeSharedPlan, draftFromSharedPlan } from '../features/share'
import { emptyDraft, loadDraft, saveDraft } from '../storage/draftStorage'

const money = new Intl.NumberFormat('ko-KR')
const CONTRIBUTION = { preferred: '우대형 12%', general: '일반형 6%', none: '기여금 제외' } as const

// Someone else's comparison, recalculated here from the inputs in the link. Read-only until the visitor chooses
// to copy those inputs into their own calculation.
export function SharePage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const plan = decodeSharedPlan(searchParams.get('d'))
  const [result, setResult] = useState<SavingsCalculationResponse | null>(null)
  const [error, setError] = useState('')
  const encoded = searchParams.get('d')

  useEffect(() => {
    const shared = decodeSharedPlan(encoded)
    if (!shared) return
    track('open_shared')
    getSavingsProducts()
      .then((products) => calculateSavings({
        monthlyAmount: shared.monthlyAmount,
        contributionType: shared.contributionType,
        conditionAnswers: answersForApi(draftFromSharedPlan(shared, emptyDraft), products.products),
        currentBankCode: shared.currentBankCode,
      }))
      .then(setResult)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : '계산하지 못했습니다.'))
  }, [encoded])

  function useAsMine() {
    if (!plan) return
    const mine = loadDraft()
    const hasOwn = mine.plan.monthlyAmount !== undefined || Object.keys(mine.conditions).length > 0
    if (hasOwn && !window.confirm('이 기기에 입력해 둔 내 조건을 공유받은 조건으로 바꿀까요? 월별 납입 계획은 그대로 둬요.')) return
    saveDraft(draftFromSharedPlan(plan, mine))
    navigate('/banks')
  }

  if (!plan) {
    return <section className="page">
      <p className="eyebrow">Shared result</p>
      <h1>공유 링크를 열 수 없어요</h1>
      <p className="lead">링크가 잘렸거나 바뀐 것 같아요. 공유한 사람에게 다시 보내 달라고 하거나 내 조건으로 직접 계산해 보세요.</p>
      <div className="actions"><Link className="button" to="/conditions">내 조건 입력하기</Link></div>
    </section>
  }

  return <section className="page page--wide">
    <p className="eyebrow">Shared result</p>
    <h1>공유받은 은행 비교</h1>
    <p className="lead">누군가 자기 조건으로 계산한 결과를 보냈어요. 링크에 담긴 조건으로 지금 다시 계산했어요.</p>
    {error && <ErrorNotice message={error} />}
    {!result && !error && <p className="notice">계산하는 중입니다.</p>}
    {result && <>
      <div className="comparison-summary">
        <span>월 {money.format(result.monthlyAmount)}원</span><span>{result.termMonths}개월</span>
        <span>{CONTRIBUTION[result.contributionType]}</span>
        <span>우대조건 답 {Object.keys(plan.conditions).length}개</span>
      </div>
      <ol className="bank-results">
        {result.results.map((bank, index) => <li key={bank.bankCode}>
          <span className="rank">{index + 1}</span>
          <div><strong>{bank.bankName}</strong><small>{bank.productName}</small></div>
          <div className="rate"><strong>{bank.expectedRate}%</strong><small>최고 {bank.maximumRate}%</small></div>
          <div className="maturity"><strong>{money.format(bank.expectedMaturityAmount)}원</strong><small>원금 {money.format(bank.principal)}원</small></div>
        </li>)}
      </ol>
      <p className="source-note">보낸 사람의 우대조건 답을 기준으로 한 예상치라 내 결과와 다를 수 있어요. 가입을 권하는 자료가 아니에요.</p>
    </>}
    <div className="actions">
      <button type="button" className="button" onClick={useAsMine}>이 조건으로 내 계산 시작</button>
      <Link className="button button--secondary" to="/conditions">내 조건으로 새로 계산</Link>
    </div>
  </section>
}
