import type { BankCalculationResult } from '../api/client'

const pp = (value: number) => `${Number(value.toFixed(2))}%p`

// "왜 이 금리가 나왔나요?": the expected rate laid out as the base rate plus each bonus the answers counted, so the
// number can be traced back to the conditions behind it.
export function RateExplain({ bank }: { bank: BankCalculationResult }) {
  const applied = bank.conditions.filter((condition) => condition.status === 'applied')
  const missed = bank.conditions.filter((condition) => condition.status === 'not_applied')
  const unsure = bank.conditions.filter((condition) => condition.status === 'needs_review')
  const capped = bank.baseRate + applied.reduce((sum, condition) => sum + condition.appliedBonusRate, 0) > bank.expectedRate + 0.0001
  return <details className="bank-why">
    <summary>왜 이 금리인가요?</summary>
    <ul>
      <li>기본금리 {bank.baseRate}%</li>
      {applied.map((condition) => <li key={condition.code}>+ {pp(condition.appliedBonusRate)} {condition.title} <span className="bank-why__note">(채운다고 답했어요)</span></li>)}
      <li><b>예상금리 {bank.expectedRate}%</b>{capped && ' (최고금리를 넘지 않게 맞췄어요)'}</li>
    </ul>
    {missed.length > 0 && <p className="bank-why__note">못 채운다고 답한 조건 {missed.length}개는 더하지 않았어요: {missed.map((condition) => `${condition.title}(+${pp(condition.bonusRate)})`).join(', ')}</p>}
    {unsure.length > 0 && <p className="bank-why__note">모르거나 확인이 필요한 조건 {unsure.length}개도 더하지 않았어요: {unsure.map((condition) => `${condition.title}(+${pp(condition.bonusRate)})`).join(', ')}. 다 채우면 최대 {bank.maximumRate}%예요.</p>}
  </details>
}
