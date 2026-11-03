import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getRateAlerts, type RateAlerts as Alerts, type RateChange } from '../api/client'
import { loadDraft } from '../storage/draftStorage'
import { loadDismissedDay, loadWatchlist, saveDismissedDay } from '../features/watchlist'
import './RateAlerts.css'

const KIND_LABEL = { deposit: '예금', saving: '적금' } as const

function formatDay(iso: string) {
  const [, month, day] = iso.split('-').map(Number)
  return `${month}월 ${day}일`
}

function ChangeLine({ change }: { change: RateChange }) {
  const up = Number(change.changePoint) > 0
  const point = Math.abs(Number(change.changePoint)).toLocaleString('ko-KR', { maximumFractionDigits: 2 })
  return <li>
    <span className={`rate-alerts__move rate-alerts__move--${up ? 'up' : 'down'}`}>{up ? '▲' : '▼'} {point}%p</span>{' '}
    <b>{change.company.replace(/주식회사/g, '').trim()}</b> {change.productName}
    <span className="rate-alerts__muted"> · {KIND_LABEL[change.kind]} {change.termMonths}개월 {change.rateType} {change.fieldLabel} {change.before}% → {change.after}%</span>
  </li>
}

// Shown at the top of a screen only when the user's savings bank or a starred product changed its disclosed rate
// since the previous collection day. Hidden for the day once dismissed. Says what moved, never what to do.
export function RateAlerts() {
  const [alerts, setAlerts] = useState<Alerts | null>(null)
  const [dismissed, setDismissed] = useState(() => loadDismissedDay())

  useEffect(() => {
    const bankCode = loadDraft().plan.currentBankCode
    const watch = loadWatchlist().map(({ kind, company, productCode }) => ({ kind, company, productCode }))
    if (!bankCode && watch.length === 0) return
    const controller = new AbortController()
    getRateAlerts({ ...(bankCode ? { bankCode } : {}), watch }, controller.signal).then(setAlerts).catch(() => setAlerts(null))
    return () => controller.abort()
  }, [])

  if (!alerts?.latestDay || !alerts.previousDay || dismissed === alerts.latestDay) return null
  const bankChanges = alerts.bank?.changes ?? []
  if (bankChanges.length === 0 && alerts.watched.length === 0) return null
  const latestDay = alerts.latestDay

  return <section className="rate-alerts" aria-labelledby="rate-alerts-title" role="status">
    <div className="rate-alerts__head">
      <h2 id="rate-alerts-title">금리가 바뀌었어요</h2>
      <button type="button" className="rate-alerts__close" onClick={() => { saveDismissedDay(latestDay); setDismissed(latestDay) }}>오늘은 그만 보기</button>
    </div>
    <p className="rate-alerts__muted">{formatDay(alerts.previousDay)}과 {formatDay(latestDay)}에 금융감독원에 공시된 금리를 비교했어요.</p>
    {alerts.watched.length > 0 && <>
      <h3>관심 상품</h3>
      <ul>{alerts.watched.slice(0, 5).map((change, index) => <ChangeLine key={index} change={change} />)}</ul>
    </>}
    {alerts.bank && bankChanges.length > 0 && <>
      <h3>내 적금 은행({alerts.bank.company})의 다른 예·적금</h3>
      <ul>{bankChanges.slice(0, 5).map((change, index) => <ChangeLine key={index} change={change} />)}</ul>
      {bankChanges.length > 5 && <p className="rate-alerts__muted">이 밖에 {bankChanges.length - 5}건이 더 바뀌었어요.</p>}
      <p className="rate-alerts__muted">청년미래적금 금리는 정부 정책 상품이라 이 공시에 없어요. 같은 은행의 다른 상품 금리가 움직이는 방향을 참고로 보여 드려요.</p>
    </>}
    <p className="rate-alerts__muted">
      출처 <a href={alerts.sourceUrl} target="_blank" rel="noreferrer">{alerts.sourceName} ↗</a> · 바뀐 사실만 알려 드리며 가입·해지를 권하지 않아요. ·{' '}
      <Link to="/market">전체 변동 보기</Link>
    </p>
  </section>
}
