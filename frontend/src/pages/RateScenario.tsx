import { useEffect, useId, useState } from 'react'
import { MoneyInput } from '../components/MoneyInput'
import { calculateRateScenario, type RateScenarioCase } from '../api/client'
import { MAX_MONTHLY, MIN_MONTHLY, MONTH_OPTIONS, STEP_OPTIONS } from './rateScenarioMath'

const won = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`
const percent = (value: number) => `${value.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}%`

function signedWon(value: number) {
  if (value === 0) return '차이 없음'
  return `${value > 0 ? '+' : '−'}${Math.abs(Math.round(value)).toLocaleString('ko-KR')}원`
}

const RATE_PATTERN = /^\d{1,2}(\.\d{1,2})?$/

// The three cases are shown side by side with equal weight; nothing says which one will happen.
// The server does the arithmetic (one calculation rule for the whole site).
export function RateScenario({ defaultRate }: { defaultRate: number | null }) {
  const id = useId()
  const [monthly, setMonthly] = useState<number | null>(500_000)
  const [months, setMonths] = useState<number>(12)
  const [rate, setRate] = useState(defaultRate === null ? '3' : String(defaultRate))
  const [step, setStep] = useState<number>(0.25)
  const [touchedRate, setTouchedRate] = useState(false)
  const shownRate = touchedRate || defaultRate === null ? rate : String(defaultRate)
  const [result, setResult] = useState<{ key: string; cases: RateScenarioCase[] } | null>(null)
  const [failed, setFailed] = useState('')

  const monthlyValue = monthly ?? 0
  const rateValue = Number(shownRate)
  const monthlyError = !Number.isFinite(monthlyValue) || monthlyValue < MIN_MONTHLY || monthlyValue > MAX_MONTHLY
    ? `월 납입액은 ${MIN_MONTHLY.toLocaleString('ko-KR')}원부터 ${MAX_MONTHLY.toLocaleString('ko-KR')}원까지 넣을 수 있어요.`
    : ''
  const rateError = !RATE_PATTERN.test(shownRate.trim()) || rateValue > 20
    ? '적금 금리는 0%부터 20%까지, 소수 둘째 자리까지 넣을 수 있어요.'
    : ''
  const valid = !monthlyError && !rateError
  const requestKey = valid ? `${monthlyValue}|${months}|${shownRate.trim()}|${step}` : ''

  useEffect(() => {
    if (!requestKey) return
    const [amount, term, ratePercent, change] = requestKey.split('|')
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      calculateRateScenario({ monthlyAmount: Number(amount), months: Number(term), ratePercent, step: change }, controller.signal)
        .then((body) => { setResult({ key: requestKey, cases: body.cases }); setFailed('') })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === 'AbortError') return
          setFailed(cause instanceof Error ? cause.message : '계산하지 못했어요.')
        })
    }, 250)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [requestKey])

  // Only a result for exactly the current inputs is shown.
  const cases = result && result.key === requestKey ? result.cases : null
  const labels: Record<RateScenarioCase['key'], string> = {
    up: `기준금리가 ${step}%p 오르면`, same: '기준금리가 그대로면', down: `기준금리가 ${step}%p 내리면`,
  }

  return <section className="daily-scenario" aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`}>만약 기준금리가 바뀐다면?</h2>
    <p className="daily-scenario__intro">앞으로 금리가 오를지 내릴지는 아무도 몰라요. 그래서 오르는 경우, 그대로인 경우, 내리는 경우를 모두 같은 조건으로 계산해 봤어요. 지금 새로 드는 적금이라고 생각하고 숫자를 바꿔 보세요.</p>
    <div className="daily-scenario__inputs">
      <label>
        <span>월 납입액(원)</span>
        <MoneyInput value={monthly} onValueChange={setMonthly} aria-invalid={Boolean(monthlyError)} />
      </label>
      <label>
        <span>기간</span>
        <select value={months} onChange={(event) => setMonths(Number(event.target.value))}>
          {MONTH_OPTIONS.map((value) => <option key={value} value={value}>{value}개월</option>)}
        </select>
      </label>
      <label>
        <span>지금 적금 금리(연 %)</span>
        <input
          inputMode="decimal" value={shownRate} aria-invalid={Boolean(rateError)}
          onChange={(event) => { setTouchedRate(true); setRate(event.target.value) }}
        />
      </label>
      <label>
        <span>기준금리 변화 폭</span>
        <select value={step} onChange={(event) => setStep(Number(event.target.value))}>
          {STEP_OPTIONS.map((value) => <option key={value} value={value}>{value}%p</option>)}
        </select>
      </label>
    </div>
    {defaultRate !== null && !touchedRate && <p className="daily-muted">지금 적금 금리는 은행 예금 평균금리(신규) {percent(defaultRate)}로 채워 두었어요. 내 상품 금리로 바꿔 보세요.</p>}
    {(monthlyError || rateError) && <p className="daily-scenario__error" role="alert">{monthlyError || rateError}</p>}
    {valid && failed && !cases && <p className="daily-scenario__error">{failed}</p>}
    {cases && <ul className="daily-scenario__cases" aria-label="세 가지 경우의 만기 금액">
      {cases.map((item) => <li key={item.key} className={`daily-scenario__case daily-scenario__case--${item.key}`}>
        <b>{labels[item.key]}</b>
        <span className="daily-muted">적금 금리 {percent(Number(item.ratePercent))}</span>
        <span className="daily-scenario__amount">{won(item.afterTax)}</span>
        <span className="daily-muted">세금 뗀 만기 금액 (이자 {won(item.interest)}, 세금 {won(item.tax)})</span>
        <span className="daily-scenario__diff">{item.key === 'same' ? '기준' : `그대로일 때보다 ${signedWon(item.differenceFromSame)}`}</span>
      </li>)}
    </ul>}
    <p className="daily-muted">새 적금 금리가 기준금리 변화만큼 그대로 따라 움직인다고 가정한 단순 계산이에요. 실제로는 은행마다 덜 움직이거나 늦게 움직일 수 있어요. 이미 가입한 적금은 보통 가입 때 금리가 그대로라 이 계산과 달라요. 세금은 일반 과세 15.4% 기준이며 비과세·우대 상품은 달라요. 어느 경우가 될지 예측하지 않아요.</p>
  </section>
}
