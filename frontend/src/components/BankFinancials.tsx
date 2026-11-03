import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, getBankFinancials, type BankFinancials } from '../api/client'
import { formatChangePercent, formatKrwLarge, peerRangeText } from '../features/krw'
import '../pages/DailyPage.css'

export function FinancialsTable({ data }: { data: BankFinancials }) {
  return <div className="table-scroll" tabIndex={0} aria-label="표, 좁은 화면에서는 옆으로 밀어 볼 수 있습니다">
    <table className="financials-table">
      <caption>{data.corpName} {data.year}년 {data.statement} 주요 숫자</caption>
      <thead><tr><th scope="col">항목</th><th scope="col">{data.year}년</th><th scope="col">{data.year - 1}년</th><th scope="col">변화</th></tr></thead>
      <tbody>
        {data.items.map((item) => <tr key={item.key}>
          <th scope="row">{item.label}</th>
          <td>{formatKrwLarge(item.current)}</td>
          <td>{formatKrwLarge(item.previous)}</td>
          <td>{formatChangePercent(item.changePercent)}</td>
        </tr>)}
      </tbody>
    </table>
  </div>
}

const RATIO_ROWS = [
  { key: 'equityToAssets', label: '자본 ÷ 자산', hint: '은행이 가진 것 중 자기 돈의 몫' },
  { key: 'depositsToLiabilities', label: '예수부채 ÷ 부채', hint: '빚 중에서 고객 예금이 차지하는 몫' },
  { key: 'netIncomeToAssets', label: '당기순이익 ÷ 자산', hint: '자산 100원으로 1년에 남긴 이익' },
] as const

export function RatioList({ data }: { data: BankFinancials }) {
  return <dl className="financials-ratios">
    {RATIO_ROWS.map((row) => <div key={row.key}>
      <dt>{row.label}<span className="daily-muted"> · {row.hint}</span></dt>
      <dd>
        <b>{data.ratios[row.key] === null ? '–' : `${data.ratios[row.key]}%`}</b>
        {peerRangeText(data.peers[row.key]) && <span className="daily-muted">{peerRangeText(data.peers[row.key])}</span>}
      </dd>
    </div>)}
  </dl>
}

export function FinancialsSource({ data }: { data: BankFinancials }) {
  return <p className="source-note">
    출처: <a href={data.sourceUrl} target="_blank" rel="noreferrer">{data.sourceName} ({data.periodEnd} 기준) ↗</a>
  </p>
}

// Bank detail: the bank's own reported numbers, plain ratios and where they came from. No grade or safety call.
export function BankFinancialsSection({ bankCode }: { bankCode: string }) {
  // Kept with the bank it belongs to, so a different bank reads as loading without resetting state in the effect.
  const [loaded, setLoaded] = useState<{ bankCode: string; state: 'ready' | 'missing' | 'failed'; data: BankFinancials | null } | null>(null)
  const state = loaded?.bankCode === bankCode ? loaded.state : 'loading'
  const data = loaded?.bankCode === bankCode ? loaded.data : null

  useEffect(() => {
    const controller = new AbortController()
    getBankFinancials(bankCode, controller.signal).then((body) => setLoaded({ bankCode, state: 'ready', data: body })).catch((cause: unknown) => {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      setLoaded({ bankCode, state: cause instanceof ApiError && cause.status === 404 ? 'missing' : 'failed', data: null })
    })
    return () => controller.abort()
  }, [bankCode])

  return <section className="bank-financials" aria-labelledby="bank-financials-title">
    <h2 className="section-title" id="bank-financials-title">재무제표 한눈에</h2>
    {state === 'loading' && <p className="daily-muted">DART 공시 숫자를 불러오는 중입니다.</p>}
    {state === 'missing' && <p className="daily-muted">이 은행은 DART에 주요 재무 숫자가 없어요. 상장하지 않았거나 사업보고서를 내지 않는 곳일 수 있어요.</p>}
    {state === 'failed' && <p className="daily-muted">재무 숫자를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.</p>}
    {state === 'ready' && data && <>
      <FinancialsTable data={data} />
      <RatioList data={data} />
      <p className="daily-muted">사업보고서 숫자를 그대로 옮기고 나눗셈만 했어요. 은행의 안전성 등급(BIS 비율 등)이 아니고, 좋다·나쁘다를 판단하지 않아요.</p>
      <FinancialsSource data={data} />
      <p><Link to="/daily?tab=finance">이 숫자를 읽는 법 배우기 →</Link></p>
    </>}
  </section>
}
