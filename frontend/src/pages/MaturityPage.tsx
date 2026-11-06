import { useEffect, useId, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  calculateSavings, getSavingsProducts, planAfterMaturity,
  type HoldingOutcome, type MaturityOption, type MaturityPlanResponse, type RiskProfile,
} from '../api/client'
import { MoneyInput } from '../components/MoneyInput'
import { track } from '../features/analytics'
import { buildMaturityIcs, downloadIcs, maturityMonth, REMINDER_DAYS, EARLY_REMINDER_DAYS } from '../features/maturityCalendar'
import { answersForApi } from '../features/savingsDraft'
import { loadDraft } from '../storage/draftStorage'
import { DepositProducts } from './DepositProducts'
import { PROFILES, PROFILE_QUESTIONS, profileFromAnswers } from './maturityProfile'
import './MaturityPage.css'

const MIN_AMOUNT = 100_000
const MAX_AMOUNT = 1_000_000_000

const won = (value: number) => `${value.toLocaleString('ko-KR')}원`
const signedPercent = (value: string) => {
  const number = Number(value)
  return `${number > 0 ? '+' : ''}${number.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}%`
}
const monthLabel = (month: string) => `${month.slice(0, 4)}년 ${Number(month.slice(5, 7))}월`

// Where the worst, average and best past outcomes sit between the lowest and highest values on screen.
function RangeBar({ history, low, high }: { history: HoldingOutcome; low: number; high: number }) {
  const span = high - low || 1
  const at = (value: string) => `${((Number(value) - low) / span) * 100}%`
  const zero = low < 0 && high > 0 ? at('0') : null
  return <div className="maturity-range" aria-hidden="true">
    {zero && <span className="maturity-range__zero" style={{ left: zero }} />}
    <span className="maturity-range__bar" style={{ left: at(history.worstPercent), right: `calc(100% - ${at(history.bestPercent)})` }} />
    <span className="maturity-range__avg" style={{ left: at(history.averagePercent) }} />
  </div>
}

function HistoryText({ history, months }: { history: HoldingOutcome; months: number }) {
  return <>
    <dl className="maturity-history">
      <div><dt>평균</dt><dd>{signedPercent(history.averagePercent)} · {won(history.averageValue)}</dd></div>
      <div><dt>가장 좋았을 때</dt><dd>{signedPercent(history.bestPercent)} · {won(history.bestValue)}</dd></div>
      <div><dt>가장 나빴을 때</dt><dd>{signedPercent(history.worstPercent)} · {won(history.worstValue)}</dd></div>
      <div><dt>손해 본 경우</dt><dd>{history.windows}번 중 {history.lossWindows}번</dd></div>
    </dl>
    <p className="maturity-muted">{monthLabel(history.firstStart)}부터 {monthLabel(history.lastStart)}까지 매달 한 번에 넣고 {months}개월 들고 있었다고 본 과거 결과예요.</p>
  </>
}

function OptionCard({ option, months, low, high }: { option: MaturityOption; months: number; low: number; high: number }) {
  return <li className={`maturity-option maturity-option--risk${option.riskLevel}`}>
    <div className="maturity-option__head">
      <h3>{option.name}</h3>
      <span className={`maturity-badge${option.principalProtected ? ' maturity-badge--safe' : ''}`}>
        {option.principalProtected ? '원금 손실 없음' : '원금 손실 가능'}
      </span>
    </div>
    <p className="maturity-muted">위험 정도: {option.riskLabel}</p>
    <p>{option.summary}</p>
    {option.deposit && <div className="maturity-deposit">
      <p className="maturity-amount">{months}개월 뒤 {won(option.deposit.endingValue)}</p>
      <p className="maturity-muted">연 {Number(option.deposit.ratePercent).toLocaleString('ko-KR')}% · 이자 {won(option.deposit.interest)} · 세금(15.4%) 뗀 뒤 {won(option.deposit.endingValueAfterTax)}</p>
    </div>}
    {option.history && <>
      <RangeBar history={option.history} low={low} high={high} />
      <HistoryText history={option.history} months={months} />
    </>}
    <p className="maturity-warning">{option.warning}</p>
    <p className="maturity-muted">출처 {option.sourceUrl.startsWith('https://')
      ? <a href={option.sourceUrl} target="_blank" rel="noreferrer">{option.sourceName} ↗</a>
      : option.sourceName}</p>
  </li>
}

function ProfileQuiz({ onResult }: { onResult: (profile: RiskProfile) => void }) {
  const [answers, setAnswers] = useState<(number | null)[]>(PROFILE_QUESTIONS.map(() => null))
  const done = answers.every((answer) => answer !== null)
  return <details className="maturity-quiz">
    <summary>잘 모르겠다면 질문 3개로 확인해 보기</summary>
    {PROFILE_QUESTIONS.map((question, index) => <fieldset key={question.text}>
      <legend>{question.text}</legend>
      {question.choices.map((choice, score) => <label key={choice}>
        <input
          type="radio" name={`quiz-${index}`} checked={answers[index] === score}
          onChange={() => setAnswers((current) => current.map((value, at) => at === index ? score : value))}
        /> {choice}
      </label>)}
    </fieldset>)}
    <button type="button" className="button button--secondary" disabled={!done} onClick={() => onResult(profileFromAnswers(answers as number[]))}>이 답으로 성향 고르기</button>
    <p className="maturity-muted">간단한 참고용 확인이에요. 금융회사의 투자성향 진단을 대신하지 않아요.</p>
  </details>
}

export function MaturityPage() {
  const id = useId()
  const [amount, setAmount] = useState<number | null>(10_000_000)
  const [months, setMonths] = useState<12 | 24>(12)
  const [profile, setProfile] = useState<RiskProfile | null>(null)
  const [mixAsset, setMixAsset] = useState('')
  const [depositShare, setDepositShare] = useState(70)
  const [plan, setPlan] = useState<MaturityPlanResponse | null>(null)
  const [error, setError] = useState('')
  const [importNote, setImportNote] = useState('')
  const [searchParams] = useSearchParams()
  const autoImported = useRef(false)
  const counted = useRef(false)  // one "plan_maturity" per visit, not one per slider move
  const [reminder, setReminder] = useState<{ startMonth: string; termMonths: number; bankName: string; productName: string } | null>(null)

  const amountValue = amount ?? 0
  const amountError = !Number.isInteger(amountValue) || amountValue < MIN_AMOUNT || amountValue > MAX_AMOUNT
    ? `만기 금액은 ${won(MIN_AMOUNT)}부터 ${won(MAX_AMOUNT)}까지 넣을 수 있어요.`
    : ''

  useEffect(() => {
    if (!profile || amountError) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      planAfterMaturity({
        amount: amountValue, months, profile,
        ...(mixAsset ? { mix: { assetCode: mixAsset, depositShare } } : {}),
      }, controller.signal).then((body) => {
        setPlan(body)
        setError('')
        if (!counted.current) { counted.current = true; track('plan_maturity') }
      }).catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setPlan(null)
        setError(cause instanceof Error ? cause.message : '계산하지 못했습니다.')
      })
    }, 250)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [amountValue, amountError, months, profile, mixAsset, depositShare])

  function importFromPlan() {
    const draft = loadDraft()
    const bankCode = draft.plan.currentBankCode
    if (!bankCode || !draft.plan.monthlyAmount) {
      setImportNote('저장된 계산이 없어요. 내 조건에서 은행과 월 납입액을 먼저 정해 주세요.')
      return
    }
    setImportNote('불러오는 중이에요.')
    getSavingsProducts()
      .then((products) => calculateSavings({
        monthlyAmount: draft.plan.monthlyAmount ?? 0,
        contributionType: draft.plan.contributionType ?? 'general',
        conditionAnswers: { [bankCode]: answersForApi(draft, products.products)[bankCode] ?? {} },  // only the bank being calculated
        bankCodes: [bankCode],
        currentBankCode: bankCode,
      }))
      .then((result) => {
        const mine = result.results.find((item) => item.bankCode === bankCode)
        if (!mine) throw new Error('내 은행 계산을 찾지 못했어요.')
        setAmount(mine.expectedMaturityAmount)
        setImportNote(`${mine.bankName} ${mine.productName}의 예상 만기 금액을 넣었어요.`)
        const startMonth = draft.plan.startMonth
        setReminder(startMonth && maturityMonth(startMonth, result.termMonths)
          ? { startMonth, termMonths: result.termMonths, bankName: mine.bankName, productName: mine.productName }
          : null)
      })
      .catch((cause: unknown) => setImportNote(cause instanceof Error ? cause.message : '불러오지 못했어요.'))
  }

  // Coming from 내 적금 fills in the expected maturity amount without another click.
  useEffect(() => {
    if (searchParams.get('from') !== 'my-savings' || autoImported.current) return
    autoImported.current = true
    importFromPlan()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // A stale result is never shown for inputs that are now invalid or before a profile is chosen.
  const shown = profile && !amountError ? plan : null
  const options = shown?.options ?? []
  const histories = options.flatMap((option) => option.history ? [Number(option.history.worstPercent), Number(option.history.bestPercent)] : [])
  const low = Math.min(0, ...histories)
  const high = Math.max(0, ...histories)
  const fitting = options.filter((option) => option.fitsProfile)
  const others = options.filter((option) => !option.fitsProfile)
  const investable = options.filter((option) => !option.principalProtected)

  return <section className="page page--wide maturity-page">
    <p className="eyebrow">After maturity</p>
    <h1>만기 후 계획</h1>
    <p className="lead">적금이 끝나 목돈이 생기면 어디에 둘지 다시 고르게 돼요. 내 성향을 먼저 고르면, 성향에 맞는 선택지부터 같은 금액·같은 기간으로 나란히 보여 드려요.</p>

    <section className="maturity-step" aria-labelledby={`${id}-amount`}>
      <h2 id={`${id}-amount`}>1. 만기 금액과 기간</h2>
      <div className="maturity-inputs">
        <label><span>만기 금액(원)</span>
          <MoneyInput value={amount} onValueChange={setAmount} aria-invalid={Boolean(amountError)} />
        </label>
        <label><span>얼마 동안 둘까요?</span>
          <select value={months} onChange={(event) => setMonths(Number(event.target.value) as 12 | 24)}>
            <option value={12}>12개월</option>
            <option value={24}>24개월</option>
          </select>
        </label>
      </div>
      <button type="button" className="button button--secondary" onClick={importFromPlan}>내 적금 계산에서 가져오기</button>
      {importNote && <p className="maturity-muted" role="status">{importNote}</p>}
      {reminder && <div className="maturity-reminder">
        <p>예상 만기 달: <b>{monthLabel(maturityMonth(reminder.startMonth, reminder.termMonths) ?? '')}</b></p>
        <button type="button" className="button button--secondary" onClick={() => {
          const ics = buildMaturityIcs(reminder)
          if (ics) { downloadIcs(ics, 'very-rich-maturity.ics'); track('download_reminder') }
        }}>캘린더에 만기 알림 넣기(.ics)</button>
        <p className="maturity-muted">휴대폰·구글·아웃룩 캘린더에서 열면 만기 {EARLY_REMINDER_DAYS}일 전과 {REMINDER_DAYS}일 전에 알려 줘요. 파일은 이 기기에서만 만들고 어디에도 보내지 않아요. 정확한 만기일은 가입한 은행에서 확인해 주세요.</p>
      </div>}
      {amountError && <p className="maturity-error" role="alert">{amountError}</p>}
    </section>

    <section className="maturity-step" aria-labelledby={`${id}-profile`}>
      <h2 id={`${id}-profile`}>2. 내 성향 고르기</h2>
      <div className="maturity-profiles" role="radiogroup" aria-labelledby={`${id}-profile`}>
        {PROFILES.map((item) => <label key={item.key} className={`maturity-profile${profile === item.key ? ' maturity-profile--active' : ''}`}>
          <input type="radio" name={`${id}-profile-choice`} checked={profile === item.key} onChange={() => setProfile(item.key)} />
          <b>{item.label}</b>
          <span>{item.description}</span>
        </label>)}
      </div>
      <ProfileQuiz onResult={setProfile} />
    </section>

    {!profile && <p className="notice">성향을 고르면 선택지를 보여 드려요.</p>}
    {error && <p className="maturity-error" role="alert">{error}</p>}

    {shown && <>
      <section className="maturity-step" aria-labelledby={`${id}-fit`}>
        <h2 id={`${id}-fit`}>3. {PROFILES.find((item) => item.key === shown.profile)?.label}에 맞는 선택지</h2>
        <p className="maturity-muted">{won(shown.amount)}을 {shown.months}개월 동안 둔다고 보고 모두 같은 조건으로 계산했어요. {shown.profile === 'stable' ? '원금 손실 위험이 낮은 것부터' : '고른 성향의 위험 수준에 가까운 것부터'} 보여 드려요(과거 수익이 큰 순서가 아니에요).</p>
        <ul className="maturity-options" aria-label="성향에 맞는 선택지">
          {fitting.map((option) => <OptionCard key={option.code} option={option} months={shown.months} low={low} high={high} />)}
        </ul>
        {others.length > 0 && <details className="maturity-others">
          <summary>다른 성향의 선택지 {others.length}개도 보기</summary>
          <ul className="maturity-options" aria-label="다른 성향의 선택지">
            {others.map((option) => <OptionCard key={option.code} option={option} months={shown.months} low={low} high={high} />)}
          </ul>
        </details>}
      </section>

      <DepositProducts amount={shown.amount} months={shown.months as 12 | 24} headingId={`${id}-products`} />

      <section className="maturity-step" aria-labelledby={`${id}-mix`}>
        <h2 id={`${id}-mix`}>5. 예금과 섞어 보기</h2>
        <p className="maturity-muted">한 곳에 다 넣지 않고 일부만 예금에 두면 결과가 어떻게 달라졌는지 볼 수 있어요.</p>
        <div className="maturity-inputs">
          <label><span>섞어 볼 투자</span>
            <select value={mixAsset} onChange={(event) => setMixAsset(event.target.value)}>
              <option value="">고르지 않음</option>
              {investable.map((option) => <option key={option.code} value={option.code}>{option.name}</option>)}
            </select>
          </label>
          <label><span>예금 비중 {depositShare}% · 투자 {100 - depositShare}%</span>
            <input type="range" min={0} max={100} step={10} value={depositShare} onChange={(event) => setDepositShare(Number(event.target.value))} disabled={!mixAsset} />
          </label>
        </div>
        {shown.mix && <div className="maturity-mix" aria-label="섞었을 때 결과">
          <p><b>예금 {shown.mix.depositShare}% + {shown.mix.assetName} {100 - shown.mix.depositShare}%</b></p>
          <RangeBar history={shown.mix.history} low={low} high={high} />
          <HistoryText history={shown.mix.history} months={shown.months} />
        </div>}
      </section>

      <section className="maturity-notes" aria-label="계산 안내">
        <b>안내</b>
        <ul>{shown.notes.map((note) => <li key={note}>{note}</li>)}</ul>
      </section>
    </>}

    <nav className="maturity-links" aria-label="관련 화면">
      <Link className="button button--secondary" to="/alternatives">대안 비교(매달 넣을 때)</Link>
      <Link className="button button--secondary" to="/about">계산 기준</Link>
    </nav>
  </section>
}
