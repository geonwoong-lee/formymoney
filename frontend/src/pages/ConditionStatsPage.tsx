import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getConditionStats, type ConditionStatsResponse } from '../api/client'
import { ErrorNotice } from '../components/ErrorNotice'

// 익명으로 모은 우대조건 답의 비율. 은행·조건별로 보여 주고, 응답이 적은 칸은 숨긴다.
const percent = (value: number | null) => value === null ? '적어서 숨김' : `${value}%`

export function ConditionStatsPage() {
  const [data, setData] = useState<ConditionStatsResponse | null>(null)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    getConditionStats(controller.signal).then(setData).catch((cause: unknown) => {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      setError(cause instanceof Error ? cause.message : '집계를 불러오지 못했어요.')
    })
    return () => controller.abort()
  }, [reloadKey])

  const shownCount = data?.banks.reduce((sum, bank) => sum + bank.conditions.filter((condition) => condition.shown).length, 0) ?? 0

  return (
    <section className="page page--wide">
      <p className="eyebrow">Condition stats</p>
      <h1>우대조건 현황</h1>
      <p className="lead">다른 방문자들이 은행 비교에서 각 우대조건을 &lsquo;채울 수 있다·없다·모른다&rsquo; 중 무엇으로 답했는지 비율로 보여 드려요.</p>
      <div className="notice"><ul>
        <li>통계에 동의한 브라우저가 하루 한 번, 직접 고른 답만 익명으로 보내요. 사람·기기를 구분하는 값은 받지 않아서 숫자는 사람 수가 아니라 응답 수예요.</li>
        <li>응답이 {data?.minimumResponses ?? 20}건보다 적은 조건은 비율과 응답 수를 모두 숨겨요. 한 답이라도 1~4건뿐이면 다른 칸으로 거꾸로 계산될 수 있어 그 조건 전체를 숨겨요. 비율은 정수로 반올림해요.</li>
        <li>최근 90일 응답만 세요. 하루 한 번 제한은 브라우저에 저장한 날짜로 지키는 것이라 저장값을 지우거나 다른 브라우저를 쓰면 한 사람이 여러 번 셀 수 있어요. 서버의 횟수 제한(접속 주소별 분당 60번)도 서버를 다시 켜면 처음부터 세요. 그래서 이 숫자는 조사 결과가 아니라 참고용 흐름이에요.</li>
        <li>답은 각자 자기 상황을 짐작해 고른 것이라 실제로 조건을 채웠는지와 다를 수 있어요. 어느 은행이 낫다는 뜻이 아니에요.</li>
      </ul></div>

      {error && <ErrorNotice message={error} onRetry={() => { setError(''); setReloadKey((key) => key + 1) }} />}
      {!data && !error && <p className="notice">집계를 불러오는 중이에요.</p>}
      {data && <>
        <p className="source-note">집계 기간 {data.start} ~ {data.end}{shownCount === 0 && ' · 아직 보여 줄 만큼 응답이 쌓인 조건이 없어요.'}</p>
        {data.banks.map((bank) => <section key={bank.bankCode} aria-labelledby={`stats-${bank.bankCode}`}>
          <h2 id={`stats-${bank.bankCode}`} className="section-title">{bank.bankName}</h2>
          <div className="cashflow-table-wrap">
            <table className="cashflow-table">
              <thead><tr><th>우대조건</th><th>우대금리</th><th>채울 수 있다</th><th>없다</th><th>모른다</th><th>응답 수</th></tr></thead>
              <tbody>{bank.conditions.map((condition) => <tr key={condition.code}>
                <th scope="row">{condition.title}</th>
                <td>+{condition.bonusRate}%p</td>
                {condition.shown
                  ? <><td>{percent(condition.yesPercent)}</td><td>{percent(condition.noPercent)}</td><td>{percent(condition.unknownPercent)}</td><td>{condition.responses}건</td></>
                  : <td colSpan={4}>응답이 적어 숨김</td>}
              </tr>)}</tbody>
            </table>
          </div>
        </section>)}
      </>}
      <div className="actions"><Link className="button" to="/banks">은행 비교로</Link><Link className="button button--secondary" to="/conditions">내 조건 입력</Link></div>
    </section>
  )
}
