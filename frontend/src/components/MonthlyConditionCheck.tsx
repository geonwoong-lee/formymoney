import { useState } from 'react'
import type { ConditionResult } from '../api/client'
import { currentMonth, loadChecks, pastMonths, setCheck, summarizeMonth, type CheckAnswer } from '../features/conditionChecks'

const won = (value: number) => `${value.toLocaleString('ko-KR')}원`
const monthLabel = (month: string) => `${month.slice(0, 4)}년 ${Number(month.slice(5, 7))}월`

const OPTIONS: { value: CheckAnswer | 'open'; label: string }[] = [
  { value: 'done', label: '채웠어요' },
  { value: 'open', label: '아직이에요' },
  { value: 'missed', label: '못 채웠어요' },
]

interface Props {
  applied: ConditionResult[]
  impacts: { code: string; maturityAmount: number; loss: number }[]
  today?: Date
}

// Each month, the person ticks off the bonus-rate conditions they counted on. A missed one shows what it is worth if
// it is never met afterwards: the bonus applies to the whole term, so a single missed month is not priced here.
export function MonthlyConditionCheck({ applied, impacts, today }: Props) {
  const [now] = useState(() => today ?? new Date())
  const month = currentMonth(now)
  const [checks, setChecks] = useState(loadChecks)
  const codes = applied.map((item) => item.code)
  const summary = summarizeMonth(checks, month, codes)
  const history = pastMonths(checks, month, codes)

  function choose(code: string, value: CheckAnswer | 'open') {
    setChecks((current) => setCheck(current, month, code, value === 'open' ? null : value))
  }

  return <section className="my-savings__card" aria-labelledby="my-savings-monthly">
    <h2 id="my-savings-monthly">{monthLabel(month)} 우대조건 체크</h2>
    <p className="my-savings__muted">예상금리에 넣은 조건을 이번 달에 채웠는지 눌러 두세요. 이 기록은 이 기기에만 저장돼요.</p>
    <p className="my-savings__phase" role="status">
      {summary.total}개 중 <span className="my-savings__amount">{summary.done}개</span> 채웠어요
      {summary.missed > 0 && `, ${summary.missed}개는 못 채웠어요`}
      {summary.open > 0 && `, ${summary.open}개는 아직이에요`}
    </p>
    <ul className="my-savings__checks">
      {applied.map((condition) => {
        const answer = checks[month]?.[condition.code] ?? 'open'
        const impact = impacts.find((item) => item.code === condition.code)
        return <li key={condition.code}>
          <fieldset>
            <legend>{condition.title} <span className="my-savings__muted">+{condition.appliedBonusRate}%p</span></legend>
            <div className="my-savings__options">
              {OPTIONS.map((option) => <label key={option.value} className={answer === option.value ? 'my-savings__option my-savings__option--on' : 'my-savings__option'}>
                <input type="radio" name={`check-${condition.code}`} checked={answer === option.value} onChange={() => choose(condition.code, option.value)} />
                {option.label}
              </label>)}
            </div>
            {answer === 'missed' && impact && <p className="my-savings__warn">
              이 조건을 끝까지 못 채우면 예상금리가 {condition.appliedBonusRate}%p 낮아지고 만기금액이 {won(impact.loss)} 줄어 {won(impact.maturityAmount)}이 돼요.
              은행마다 놓친 달을 어떻게 보는지 달라서, 정확한 기준은 상품 설명서에서 확인해 주세요.
            </p>}
          </fieldset>
        </li>
      })}
    </ul>
    {history.length > 0 && <p className="my-savings__muted">지난 기록: {history.map((item) => `${Number(item.month.slice(5, 7))}월 ${item.done}/${item.total}`).join(' · ')}</p>}
  </section>
}
