import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { MoneyInput } from '../components/MoneyInput'
import { loadDraft } from '../storage/draftStorage'
import { SavingProducts, type ReserveChoice } from './DepositProducts'
import './MaturityPage.css'

const MIN_MONTHLY = 10_000
const MAX_MONTHLY = 5_000_000
const TERMS = [6, 12, 24, 36] as const
const won = (value: number) => `${value.toLocaleString('ko-KR')}원`

// 일반 적금 비교: for anyone who is not a target of the youth savings, or is still finding out. The same disclosed
// 금융감독원 data as the rate alerts, worked out for the visitor's own monthly amount.
export function GeneralSavingsPage() {
  const id = useId()
  const [monthly, setMonthly] = useState<number | null>(() => Math.min(MAX_MONTHLY, Math.max(MIN_MONTHLY, loadDraft().plan.monthlyAmount ?? 300_000)))
  const [months, setMonths] = useState<(typeof TERMS)[number]>(12)
  const [reserve, setReserve] = useState<ReserveChoice>('all')
  const value = monthly ?? 0
  const invalid = !Number.isInteger(value) || value < MIN_MONTHLY || value > MAX_MONTHLY

  return <section className="page page--wide maturity-page">
    <p className="eyebrow">Savings plans</p>
    <h1>일반 적금 비교</h1>
    <p className="lead">청년미래적금 대상이 아니거나 아직 확인 중이어도, 지금 공시된 적금마다 매달 넣은 돈이 만기에 얼마가 되는지 같은 기준으로 볼 수 있어요.</p>

    <section className="maturity-step" aria-labelledby={`${id}-inputs`}>
      <h2 id={`${id}-inputs`}>1. 얼마를 얼마나 넣을까요?</h2>
      <div className="maturity-inputs">
        <label><span>매달 넣을 돈(원)</span>
          <MoneyInput value={monthly} onValueChange={setMonthly} aria-invalid={invalid} />
        </label>
        <label><span>기간</span>
          <select value={months} onChange={(event) => setMonths(Number(event.target.value) as (typeof TERMS)[number])}>
            {TERMS.map((term) => <option key={term} value={term}>{term}개월</option>)}
          </select>
        </label>
        <label><span>적립 방식</span>
          <select value={reserve} onChange={(event) => setReserve(event.target.value as ReserveChoice)}>
            <option value="all">모두</option>
            <option value="fixed">정액적립식(매달 같은 금액)</option>
            <option value="free">자유적립식(넣고 싶을 때)</option>
          </select>
        </label>
      </div>
      {invalid && <p className="maturity-error" role="alert">매달 넣을 돈은 {won(MIN_MONTHLY)}부터 {won(MAX_MONTHLY)}까지 넣을 수 있어요.</p>}
      <p className="maturity-muted">일반 적금은 청년미래적금과 달리 정부기여금이 없고, 이자에 15.4% 세금이 붙어요. 그래서 세금을 뗀 뒤 받는 돈으로 보여 드려요.</p>
    </section>

    {!invalid && <SavingProducts monthly={value} months={months} reserve={reserve} headingId={`${id}-products`} />}

    <nav className="maturity-links" aria-label="관련 화면">
      <Link className="button button--secondary" to="/conditions">청년미래적금 조건 입력</Link>
      <Link className="button button--secondary" to="/maturity">만기 후 계획</Link>
      <Link className="button button--secondary" to="/rent-loans">전세자금대출 비교</Link>
    </nav>
  </section>
}
