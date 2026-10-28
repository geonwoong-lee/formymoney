import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { calculateSavings, getSavingsProducts, type BankCalculationResult } from '../api/client'
import { answersForApi } from '../features/savingsDraft'
import { loadDraft } from '../storage/draftStorage'

const money = new Intl.NumberFormat('ko-KR')

export function BankDetailPage() {
  const { bankId } = useParams()
  const [bank, setBank] = useState<BankCalculationResult | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!bankId) return
    const draft = loadDraft()
    getSavingsProducts().then((products) => {
      if (!products.products.some((product) => product.bankCode === bankId)) throw new Error('은행 상품을 찾을 수 없습니다.')
      return calculateSavings({
        monthlyAmount: draft.plan.monthlyAmount ?? 500_000,
        contributionType: draft.plan.contributionType ?? 'general',
        conditionAnswers: answersForApi(draft, products.products),
        bankCodes: [bankId],
      })
    }).then((response) => setBank(response.results[0])).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : '상세 계산을 불러오지 못했습니다.'))
  }, [bankId])

  return <section className="page page--wide">
    <p className="eyebrow">Bank detail</p>
    {error && <p className="notice notice--error">{error}</p>}
    {!bank && !error && <p className="notice">계산 근거를 불러오는 중입니다.</p>}
    {bank && <>
      <h1>{bank.bankName}</h1>
      <p className="lead">예상금리 {bank.expectedRate}% · 예상 만기금액 {money.format(bank.expectedMaturityAmount)}원</p>
      <dl className="money-breakdown">
        <div><dt>내가 넣은 원금</dt><dd>{money.format(bank.principal)}원</dd></div>
        <div><dt>은행 이자</dt><dd>{money.format(bank.depositInterest)}원</dd></div>
        <div><dt>정부기여금</dt><dd>{money.format(bank.governmentContribution)}원</dd></div>
        <div><dt>기여금 이자</dt><dd>{money.format(bank.governmentContributionInterest)}원</dd></div>
      </dl>
      <h2 className="section-title">우대조건 계산 근거</h2>
      <ul className="condition-results">
        {bank.conditions.map((condition) => <li key={condition.code}>
          <div><strong>{condition.title}</strong><span>{condition.reason}</span></div>
          <b>{condition.appliedBonusRate > 0 ? `+${condition.appliedBonusRate}%p` : '미반영'}</b>
        </li>)}
      </ul>
      <p className="source-note">공시 확인일 {bank.sourceDate} · <a href={bank.sourceUrl} target="_blank" rel="noreferrer">원문 보기</a></p>
      <div className="actions"><Link className="button" to="/banks">비교 목록으로</Link><Link className="button button--secondary" to="/conditions">조건 수정</Link></div>
    </>}
  </section>
}
