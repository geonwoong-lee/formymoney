import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { calculateSavings, getSavingsProducts, type SavingsCalculationResponse } from '../api/client'
import { answersForApi } from '../features/savingsDraft'
import { loadDraft } from '../storage/draftStorage'

const money = new Intl.NumberFormat('ko-KR')

export function BanksPage() {
  const [result, setResult] = useState<SavingsCalculationResponse | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const draft = loadDraft()
    getSavingsProducts()
      .then((products) => calculateSavings({
        monthlyAmount: draft.plan.monthlyAmount ?? 500_000,
        contributionType: draft.plan.contributionType ?? 'general',
        conditionAnswers: answersForApi(draft, products.products),
        currentBankCode: draft.plan.currentBankCode,
      }))
      .then(setResult)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : '계산하지 못했습니다.'))
  }, [])

  return (
    <section className="page page--wide">
      <p className="eyebrow">Banks</p>
      <h1>내 조건으로 계산한 은행 비교</h1>
      <p className="lead">예상 만기금액이 큰 순서입니다. 같은 금액이면 예상금리가 높은 상품이 먼저 보입니다.</p>
      {error && <p className="notice notice--error">{error} <Link to="/conditions">조건 다시 입력하기</Link></p>}
      {!result && !error && <p className="notice">14개 상품을 계산하는 중입니다.</p>}
      {result && <>
        <div className="comparison-summary">
          <span>월 {money.format(result.monthlyAmount)}원</span><span>{result.termMonths}개월</span>
          <span>{result.contributionType === 'preferred' ? '우대형 12%' : result.contributionType === 'general' ? '일반형 6%' : '기여금 제외'}</span>
        </div>
        <ol className="bank-results">
          {result.results.map((bank, index) => <li key={bank.bankCode}>
            <span className="rank">{index + 1}</span>
            <div><strong>{bank.bankName}</strong><small>{bank.productName}</small></div>
            <div className="rate"><strong>{bank.expectedRate}%</strong><small>최고 {bank.maximumRate}%</small></div>
            <div className="maturity">
              <strong>{money.format(bank.expectedMaturityAmount)}원</strong>
              <small>원금 {money.format(bank.principal)}원</small>
              {bank.differenceFromCurrentBank !== null && <small className={`difference ${bank.differenceFromCurrentBank > 0 ? 'difference--plus' : bank.differenceFromCurrentBank < 0 ? 'difference--minus' : ''}`}>
                {bank.differenceFromCurrentBank === 0 ? '현재 주거래 은행' : `현재 은행보다 ${bank.differenceFromCurrentBank > 0 ? '+' : ''}${money.format(bank.differenceFromCurrentBank)}원`}
              </small>}
            </div>
            <Link className="button button--small" to={`/banks/${bank.bankCode}`}>상세</Link>
          </li>)}
        </ol>
        <div className="actions"><Link className="button button--secondary" to="/conditions">조건 수정하기</Link></div>
      </>}
    </section>
  )
}
