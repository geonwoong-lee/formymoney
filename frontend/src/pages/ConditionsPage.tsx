import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSavingsProducts, type ConditionAnswer, type SavingsProductsResponse } from '../api/client'
import { answerKey, commonAnswerKey } from '../features/savingsDraft'
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

  function answerOptions(key: string, answer: ConditionAnswer, onChange: (answer: ConditionAnswer) => void) {
    return <div className="answer-options">
      {([['yes', '예'], ['no', '아니요'], ['unknown', '모름']] as const).map(([value, label]) => (
        <label key={value}><input type="radio" name={key} value={value} checked={answer === value} onChange={() => onChange(value)} /> {label}</label>
      ))}
    </div>
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
      {data && <section className="common-questions" aria-labelledby="common-question-title">
        <h2 id="common-question-title">모든 은행에 공통인 질문</h2>
        <p>두 번만 답하면 모든 은행의 공통 우대에 한꺼번에 반영됩니다.</p>
        {data.products[0].conditions.filter((condition) => ['income_plus', 'financial_counseling'].includes(condition.code)).map((condition) => {
          const key = commonAnswerKey(condition.code)
          const answer = draft.conditions[key] ?? 'unknown'
          return <fieldset key={condition.code}>
            <legend>{condition.question} <small>+{condition.bonusRate}%p</small></legend>
            <p>{condition.description}</p>
            {answerOptions(key, answer, (value) => update({ ...draft, conditions: { ...draft.conditions, [key]: value } }))}
          </fieldset>
        })}
      </section>}
      {data && <div className="optional-heading">
        <h2>은행별 조건은 선택사항</h2>
        <p>지금은 건너뛰어도 비교할 수 있습니다. 자주 쓰거나 관심 있는 은행만 펼쳐 답해보세요.</p>
      </div>}
      <div className="bank-question-list">
        {data?.products.map((product) => (
          <details className="bank-question" key={product.bankCode}>
            <summary><strong>{product.bankName}</strong><span>기본 {product.baseRate}% · 최고 {product.maximumRate}%</span></summary>
            <div className="bank-question__body">
              {product.conditions.filter((condition) => !['income_plus', 'financial_counseling'].includes(condition.code)).map((condition) => {
                const key = answerKey(product.bankCode, condition.code)
                const answer = draft.conditions[key] ?? 'unknown'
                return <fieldset key={condition.code}>
                  <legend>{condition.question} <small>+{condition.bonusRate}%p</small></legend>
                  <p>{condition.description}</p>
                  {answerOptions(key, answer, (value) => setAnswer(product.bankCode, condition.code, value))}
                </fieldset>
              })}
              <a href={product.sourceUrl} target="_blank" rel="noreferrer">공시 원문 · {product.sourceDate}</a>
            </div>
          </details>
        ))}
      </div>
      <div className="actions actions--sticky">
        <button className="button" type="button" disabled={!data || monthlyAmount < 1_000 || monthlyAmount > 500_000} onClick={() => navigate('/banks')}>지금 답변으로 14개 비교하기</button>
      </div>
    </section>
  )
}
