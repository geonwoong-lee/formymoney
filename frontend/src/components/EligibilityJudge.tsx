import { useId, useState, type FormEvent } from 'react'
import {
  judgeYouthEligibility, MAX_TABLE_HOUSEHOLD, objectMark, RULES_ROUND, RULES_SOURCE_NAME, RULES_SOURCE_URL, YOUTH_OFFICIAL_NAME, YOUTH_OFFICIAL_URL,
  type EligibilityResult, type EligibilityVerdict,
} from '../features/eligibility'
import { RULES, type IncomeKind } from '../features/eligibilityRules'

const VERDICT_TITLE: Record<EligibilityVerdict, string> = {
  preferred: '우대형 조건에 맞아요',
  general: '일반형으로 가입할 수 있어요',
  tax_only: '가입은 되지만 정부 기여금은 없어요',
  duplicate: '청년도약계좌와는 중복 가입이 안 돼요',
  not_eligible: '가입 대상이 아니에요',
}

interface Props {
  onJudged: (verdict: EligibilityVerdict) => void
  today?: Date
}

// Checks the published age and income rules against what the visitor types. Nothing typed here is stored or sent.
export function EligibilityJudge({ onJudged, today }: Props) {
  const id = useId()
  const [birthDate, setBirthDate] = useState('')
  const [militaryMonths, setMilitaryMonths] = useState('0')
  const [kind, setKind] = useState<IncomeKind>('worker')
  const [hasYouthAccount, setHasYouthAccount] = useState(false)
  const [amount, setAmount] = useState('')
  const [smallCompany, setSmallCompany] = useState(false)
  const [householdSize, setHouseholdSize] = useState('1')
  const [couple, setCouple] = useState(false)
  const [householdIncome, setHouseholdIncome] = useState('')
  const [result, setResult] = useState<EligibilityResult | null>(null)
  const [error, setError] = useState('')

  const sizeNumber = Number(householdSize)
  const needsHousehold = sizeNumber <= MAX_TABLE_HOUSEHOLD

  function submit(event: FormEvent) {
    event.preventDefault()
    setResult(null)
    if (!birthDate) return setError('생년월일을 넣어 주세요.')
    if (amount.trim() === '' || Number(amount) < 0) return setError(`작년 ${RULES.income[kind].label}${objectMark(RULES.income[kind].label)} 넣어 주세요.`)
    if (needsHousehold && (householdIncome.trim() === '' || Number(householdIncome) < 0)) return setError('가구 전체의 작년 소득을 넣어 주세요.')
    const judged = judgeYouthEligibility({
      birthDate, militaryMonths: Number(militaryMonths) || 0, kind, amount: Number(amount), smallCompany, householdSize: sizeNumber,
      couple, householdIncome: Number(householdIncome) || 0, hasYouthAccount,
    }, today)
    if (!judged) return setError('생년월일을 다시 확인해 주세요.')
    setError('')
    setResult(judged)
    onJudged(judged.verdict)
  }

  return <details className="eligibility__judge">
    <summary>내 조건으로 확인해 보기</summary>
    <form onSubmit={submit} noValidate>
      <div className="eligibility__field">
        <label htmlFor={`${id}-birth`}>생년월일</label>
        <input id={`${id}-birth`} type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} />
      </div>
      <div className="eligibility__field">
        <label htmlFor={`${id}-military`}>병역을 마쳤다면 복무 기간(개월, 최대 72)</label>
        <input id={`${id}-military`} type="number" inputMode="numeric" min={0} max={72} value={militaryMonths} onChange={(event) => setMilitaryMonths(event.target.value)} />
      </div>
      <fieldset className="eligibility__field">
        <legend>소득 종류</legend>
        <label><input type="radio" name={`${id}-kind`} checked={kind === 'worker'} onChange={() => setKind('worker')} /> 근로소득자(총급여)</label>
        <label><input type="radio" name={`${id}-kind`} checked={kind === 'income'} onChange={() => setKind('income')} /> 종합소득 신고자</label>
        <label><input type="radio" name={`${id}-kind`} checked={kind === 'business'} onChange={() => setKind('business')} /> 소상공인(연매출)</label>
      </fieldset>
      <div className="eligibility__field">
        <label htmlFor={`${id}-amount`}>작년 {RULES.income[kind].label}(만원)</label>
        <input id={`${id}-amount`} type="number" inputMode="numeric" min={0} value={amount} onChange={(event) => setAmount(event.target.value)} />
      </div>
      {RULES.income[kind].needsSmallCompany && <label className="eligibility__check">
        <input type="checkbox" checked={smallCompany} onChange={(event) => setSmallCompany(event.target.checked)} /> 중소기업에 다니고 있어요
      </label>}
      <div className="eligibility__field">
        <label htmlFor={`${id}-size`}>가구원 수(나 포함)</label>
        <select id={`${id}-size`} value={householdSize} onChange={(event) => setHouseholdSize(event.target.value)}>
          {Array.from({ length: MAX_TABLE_HOUSEHOLD }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count}명</option>)}
          <option value={MAX_TABLE_HOUSEHOLD + 1}>{MAX_TABLE_HOUSEHOLD + 1}명 이상</option>
        </select>
      </div>
      {sizeNumber === 2 && <label className="eligibility__check">
        <input type="checkbox" checked={couple} onChange={(event) => setCouple(event.target.checked)} /> 나와 배우자 둘뿐인 가구예요
      </label>}
      {needsHousehold && <div className="eligibility__field">
        <label htmlFor={`${id}-household`}>가구 전체의 작년 소득(만원)</label>
        <input id={`${id}-household`} type="number" inputMode="numeric" min={0} value={householdIncome} onChange={(event) => setHouseholdIncome(event.target.value)} />
      </div>}
      <label className="eligibility__check">
        <input type="checkbox" checked={hasYouthAccount} onChange={(event) => setHasYouthAccount(event.target.checked)} /> 청년도약계좌에 가입해 있어요
      </label>
      <button type="submit" className="button button--small">확인하기</button>
      {error && <p className="eligibility__error" role="alert">{error}</p>}
    </form>
    {result && <div className="eligibility__result" role="status">
      <h3>{VERDICT_TITLE[result.verdict]}</h3>
      <ul>{result.lines.map((line) => <li key={line}>{line}</li>)}</ul>
      <p className="eligibility__muted">
        입력한 값은 이 기기에도 서버에도 저장하지 않아요. 결과는 위의 “대상이에요” 선택에만 반영돼요.
      </p>
    </div>}
    <p className="eligibility__muted">
      기준은 <a href={RULES_SOURCE_URL} target="_blank" rel="noreferrer">{RULES_SOURCE_NAME} ↗</a>({RULES_ROUND})를 따랐어요.
      신청 기간과 출생일 범위는 모집 때마다 달라지고, 최종 심사는 서민금융진흥원과 가입 은행이 해요.
      소득을 합산하는 가구원 범위, 중소기업 신규 재직의 정의, 금융소득종합과세, 모집 회차별 출생일 범위는 계산하지 않았으니
      {' '}<a href={YOUTH_OFFICIAL_URL} target="_blank" rel="noreferrer">{YOUTH_OFFICIAL_NAME} ↗</a>에서 확인해 주세요.
    </p>
  </details>
}
