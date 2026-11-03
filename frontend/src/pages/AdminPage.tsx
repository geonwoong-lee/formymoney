import { useState, type FormEvent } from 'react'
import { getCollectionOverview, getCollectionStatus, getFunnel, type CollectionOverview, type CollectionStatus, type Funnel } from '../api/client'
import './MaturityPage.css'

const when = (value: string | null) => (value ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '없음')
const STATUS_LABEL: Record<string, string> = { success: '성공', partial: '일부 실패', failed: '실패' }

// 수집·방문 현황: for the operator only. The internal secret is typed here, held in memory and never stored.
export function AdminPage() {
  const [secret, setSecret] = useState('')
  const [days, setDays] = useState(7)
  const [data, setData] = useState<{ overview: CollectionOverview; status: CollectionStatus; funnel: Funnel } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function load(event?: FormEvent, period = days) {
    event?.preventDefault()
    if (!secret.trim()) return setError('내부 비밀값을 넣어 주세요.')
    setLoading(true)
    setError('')
    try {
      const [overview, status, funnel] = await Promise.all([getCollectionOverview(secret), getCollectionStatus(secret), getFunnel(secret, period)])
      setData({ overview, status, funnel })
    } catch (cause) {
      setData(null)
      setError(cause instanceof Error ? cause.message : '불러오지 못했어요.')
    } finally {
      setLoading(false)
    }
  }

  return <section className="page page--wide maturity-page">
    <p className="eyebrow">Operator</p>
    <h1>수집·방문 현황</h1>
    <p className="lead">운영하는 사람만 보는 화면이에요. 비밀값은 이 화면 안에서만 쓰고 저장하지 않아요.</p>

    <form className="maturity-inputs" onSubmit={(event) => void load(event)}>
      <label><span>내부 비밀값</span><input type="password" autoComplete="off" value={secret} onChange={(event) => setSecret(event.target.value)} /></label>
      <label><span>방문 통계 기간</span>
        <select value={days} onChange={(event) => { const next = Number(event.target.value); setDays(next); if (data) void load(undefined, next) }}>
          <option value={7}>최근 7일</option><option value={30}>최근 30일</option>
        </select>
      </label>
      <button type="submit" className="button" disabled={loading}>{loading ? '불러오는 중' : '불러오기'}</button>
    </form>
    {error && <p className="maturity-error" role="alert">{error}</p>}

    {data && <>
      <section className="maturity-step" aria-labelledby="admin-sources">
        <h2 id="admin-sources">수집 현황 ({data.overview.today} 기준)</h2>
        <table className="admin-table">
          <thead><tr><th>자료</th><th>최근 날짜</th><th>개수</th><th>상태</th></tr></thead>
          <tbody>
            <tr><td>예금·적금 금리</td><td>{data.overview.productRates.day ?? '없음'}</td><td>{data.overview.productRates.rows.toLocaleString('ko-KR')}</td><td>{data.overview.productRates.stale ? '오래됨' : '정상'}</td></tr>
            <tr><td>가입 조건 정보</td><td>-</td><td>{data.overview.productInfos.rows.toLocaleString('ko-KR')}</td><td>-</td></tr>
            <tr><td>전세자금대출</td><td>{data.overview.loans.day ?? '없음'}</td><td>{data.overview.loans.rows.toLocaleString('ko-KR')}</td><td>{data.overview.loans.stale ? '오래됨' : '정상'}</td></tr>
            <tr><td>은행 재무·공시(DART)</td><td>{data.overview.dart.latestFilingDay ?? '없음'}</td><td>{data.overview.dart.banks}개 은행</td><td>-</td></tr>
          </tbody>
        </table>
        <details><summary>시장 지표 {data.overview.market.length}개 계열</summary>
          <table className="admin-table"><thead><tr><th>계열</th><th>최근 값 기간</th><th>마지막 수집</th></tr></thead>
            <tbody>{data.overview.market.map((item) => <tr key={item.code}><td>{item.name}</td><td>{item.period}</td><td>{when(item.fetchedAt)}</td></tr>)}</tbody>
          </table>
        </details>
      </section>

      <section className="maturity-step" aria-labelledby="admin-runs">
        <h2 id="admin-runs">최근 실행</h2>
        <p className="maturity-muted">오늘 토큰 {data.status.todayTokens.toLocaleString('ko-KR')} / {data.status.dailyTokenLimit.toLocaleString('ko-KR')}{data.status.tokenLimitExceeded && ' (한도 초과)'}</p>
        {data.status.recent.length === 0 ? <p className="maturity-muted">기록된 실행이 없어요.</p> : <table className="admin-table">
          <thead><tr><th>작업</th><th>결과</th><th>끝난 시각</th><th>메모</th></tr></thead>
          <tbody>{data.status.recent.map((run) => <tr key={run.id}><td>{run.workflow}</td><td>{STATUS_LABEL[run.status] ?? run.status}</td><td>{when(run.finishedAt)}</td><td>{run.errorMessage ?? run.stage ?? ''}</td></tr>)}</tbody>
        </table>}
      </section>

      <section className="maturity-step" aria-labelledby="admin-funnel">
        <h2 id="admin-funnel">방문 통계 ({data.funnel.start} ~ {data.funnel.end})</h2>
        <p className="maturity-muted">동의한 방문만 센 숫자예요. 누가 방문했는지는 기록하지 않아요.</p>
        <table className="admin-table">
          <thead><tr><th>단계</th><th>횟수</th><th>첫 단계 대비</th></tr></thead>
          <tbody>{data.funnel.steps.map((step) => <tr key={step.event}><td>{step.label}</td><td>{step.count.toLocaleString('ko-KR')}</td><td>{step.ofFirstStepPercent === null ? '-' : `${step.ofFirstStepPercent}%`}</td></tr>)}</tbody>
        </table>
      </section>
    </>}
  </section>
}
