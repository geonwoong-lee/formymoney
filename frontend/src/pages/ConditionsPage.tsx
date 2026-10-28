import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSavingsProducts, type ConditionAnswer, type SavingsProductsResponse } from '../api/client'
import { answerKey } from '../features/savingsDraft'
import { loadDraft, saveDraft, type VeryRichDraft } from '../storage/draftStorage'

export function ConditionsPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<SavingsProductsResponse | null>(null)
  const [draft, setDraft] = useState<VeryRichDraft>(() => loadDraft())
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    getSavingsProducts(controller.signal).then(setData).catch((cause: unknown) => {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      setError(cause instanceof Error ? cause.message : '상품 정보를 불러오지 못했습니다.')
    })
    return () => controller.abort()
  }, [])

  function update(next: VeryRichDraft) {
    setDraft(next)
    saveDraft(next)
  }

  function setAnswer(bankCode: string, conditionCode: string, answer: ConditionAnswer) {
    update({ ...draft, conditions: { ...draft.conditions, [answerKey(bankCode, conditionCode)]: answer } })
  }

  const monthlyAmount = draft.plan.monthlyAmount ?? 500_000
  const contributionType = draft.plan.contributionType ?? 'general'

  return (
    <section className="page page--wide">
      <p className="eyebrow">Conditions</p>
      <h1>내가 지킬 수 있는 조건만 골라주세요.</h1>
      <p className="lead">모르면 ‘모름’을 선택하세요. 최고금리가 아니라 지금 답변으로 받을 수 있는 예상금리를 계산합니다.</p>

      <div className="retro-form summary-controls">
        <label>매달 넣을 금액
          <input type="number" min="1000" max="500000" step="1000" value={monthlyAmount}
            onChange={(event) => update({ ...draft, plan: { ...draft.plan, monthlyAmount: Number(event.target.value) } })} />
        </label>
        <label>정부기여금 유형
          <select value={contributionType} onChange={(event) => update({ ...draft, plan: { ...draft.plan, contributionType: event.target.value as VeryRichDraft['plan']['contributionType'] } })}>
            <option value="general">일반형 6%</option>
            <option value="preferred">우대형 12%</option>
            <option value="none">기여금 제외</option>
          </select>
        </label>
      </div>

      {error && <p className="notice notice--error">{error}</p>}
      {!data && !error && <p className="notice">14개 은행의 우대조건을 불러오는 중입니다.</p>}
      <div className="bank-question-list">
        {data?.products.map((product, index) => (
          <details className="bank-question" key={product.bankCode} open={index === 0}>
            <summary><strong>{product.bankName}</strong><span>기본 {product.baseRate}% · 최고 {product.maximumRate}%</span></summary>
            <div className="bank-question__body">
              {product.conditions.map((condition) => {
                const key = answerKey(product.bankCode, condition.code)
                const answer = draft.conditions[key] ?? 'unknown'
                return <fieldset key={condition.code}>
                  <legend>{condition.question} <small>+{condition.bonusRate}%p</small></legend>
                  <p>{condition.description}</p>
                  <div className="answer-options">
                    {([['yes', '예'], ['no', '아니요'], ['unknown', '모름']] as const).map(([value, label]) => (
                      <label key={value}><input type="radio" name={key} value={value} checked={answer === value} onChange={() => setAnswer(product.bankCode, condition.code, value)} /> {label}</label>
                    ))}
                  </div>
                </fieldset>
              })}
              <a href={product.sourceUrl} target="_blank" rel="noreferrer">공시 원문 · {product.sourceDate}</a>
            </div>
          </details>
        ))}
      </div>
      <div className="actions actions--sticky">
        <button className="button" type="button" disabled={!data || monthlyAmount < 1_000 || monthlyAmount > 500_000} onClick={() => navigate('/banks')}>14개 은행 비교하기</button>
      </div>
    </section>
  )
}
