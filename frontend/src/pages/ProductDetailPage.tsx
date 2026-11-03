import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getProductDetail, type ProductDetail, type ProductOptionDetail } from '../api/client'
import { formatKrwExact } from '../features/krw'
import './MaturityPage.css'

const percent = (value: string | null) => (value === null ? '-' : `${Number(value).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}%`)
const dayLabel = (day: string) => `${Number(day.slice(5, 7))}.${Number(day.slice(8, 10))}`
const optionLabel = (option: ProductOptionDetail) => [`${option.termMonths}개월`, option.rateType, option.reserveType].filter(Boolean).join(' · ')

const WIDTH = 520
const HEIGHT = 150
const PAD = { left: 44, right: 12, top: 12, bottom: 24 }

// The base rate over the days collected, drawn as a line. The values are also listed in a table below it.
function RateLine({ option }: { option: ProductOptionDetail }) {
  const points = option.history.filter((point) => point.baseRate !== null).map((point) => ({ day: point.day, value: Number(point.baseRate) }))
  if (points.length < 2) return null
  const values = points.map((point) => point.value)
  const low = Math.min(...values)
  const high = Math.max(...values)
  const span = high - low || 1
  const x = (index: number) => PAD.left + (index / (points.length - 1)) * (WIDTH - PAD.left - PAD.right)
  const y = (value: number) => PAD.top + (1 - (value - low) / span) * (HEIGHT - PAD.top - PAD.bottom)
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ')
  return <svg className="rate-line" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`기본금리 ${percent(String(points[0].value))}에서 ${percent(String(points.at(-1)?.value))}까지, ${points.length}일치`}>
    <line x1={PAD.left} x2={WIDTH - PAD.right} y1={HEIGHT - PAD.bottom} y2={HEIGHT - PAD.bottom} stroke="#808080" />
    <text x={PAD.left - 6} y={y(high) + 4} textAnchor="end" fontSize="11">{high.toFixed(2)}</text>
    {low !== high && <text x={PAD.left - 6} y={y(low) + 4} textAnchor="end" fontSize="11">{low.toFixed(2)}</text>}
    <text x={PAD.left} y={HEIGHT - 6} fontSize="11">{dayLabel(points[0].day)}</text>
    <text x={WIDTH - PAD.right} y={HEIGHT - 6} textAnchor="end" fontSize="11">{dayLabel(points[points.length - 1].day)}</text>
    <path d={path} fill="none" stroke="#000080" strokeWidth="2" />
    {points.map((point, index) => <circle key={point.day} cx={x(index)} cy={y(point.value)} r="3" fill="#000080" />)}
  </svg>
}

// 상품 상세: one product's terms and how each option's disclosed rate moved, from the daily 금융감독원 records.
export function ProductDetailPage() {
  const [params] = useSearchParams()
  const kind = params.get('kind') === 'deposit' ? 'deposit' : 'saving'
  const company = params.get('company') ?? ''
  const code = params.get('code') ?? ''
  const [loaded, setLoaded] = useState<{ key: string; detail: ProductDetail | null } | null>(null)
  const [optionIndex, setOptionIndex] = useState(0)
  const key = `${kind}|${company}|${code}`
  const detail = loaded?.key === key ? loaded.detail : undefined

  useEffect(() => {
    if (!company || !code) return
    const controller = new AbortController()
    getProductDetail(kind, company, code, controller.signal)
      .then((response) => { setLoaded({ key, detail: response }); setOptionIndex(0) })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setLoaded({ key, detail: null })
      })
    return () => controller.abort()
  }, [key, kind, company, code])

  if (!company || !code) {
    return <section className="page page--wide maturity-page"><h1>상품 상세</h1>
      <p className="lead">목록에서 상품의 “상세”를 눌러 들어와 주세요. <Link to="/general-savings">적금 찾기</Link></p></section>
  }
  const option = detail?.options[optionIndex] ?? detail?.options[0]
  const first = option?.history[0]
  const last = option?.history.at(-1)
  const changed = first && last && first.baseRate !== null && last.baseRate !== null ? Number(last.baseRate) - Number(first.baseRate) : null

  return <section className="page page--wide maturity-page">
    <p className="eyebrow">Product</p>
    <h1>{detail ? `${detail.company} ${detail.productName}` : '상품 상세'}</h1>
    {detail === undefined && <p className="maturity-muted">불러오는 중이에요.</p>}
    {detail === null && <p className="maturity-muted">이 상품의 공시 기록을 찾지 못했어요. 목록에서 다시 골라 주세요. <Link to={kind === 'deposit' ? '/maturity' : '/general-savings'}>목록으로</Link></p>}
    {detail && option && <>
      <p className="lead">{detail.group} {kind === 'deposit' ? '정기예금' : '적금'} · 금감원 공시를 {detail.daysCollected}일 동안 모았어요({detail.firstDay.replaceAll('-', '.')} ~ {detail.lastDay.replaceAll('-', '.')}).</p>

      <section className="maturity-step" aria-labelledby="pd-rate">
        <h2 id="pd-rate">금리가 어떻게 바뀌었나요</h2>
        <label className="maturity-search"><span>기간·방식</span>
          <select value={optionIndex} onChange={(event) => setOptionIndex(Number(event.target.value))}>
            {detail.options.map((item, index) => <option key={optionLabel(item)} value={index}>{optionLabel(item)}</option>)}
          </select>
        </label>
        <p>지금 기본금리 <b>{percent(last?.baseRate ?? null)}</b>{last?.maxRate && Number(last.maxRate) > Number(last.baseRate ?? 0) && <>, 우대 조건을 다 채우면 {percent(last.maxRate)}</>}
          {changed !== null && option.history.length > 1 && <> · 모은 기간 동안 {changed === 0 ? '변화가 없어요' : `${changed > 0 ? '+' : ''}${changed.toFixed(2)}%p 바뀌었어요`}</>}</p>
        {option.history.length < 2 && <p className="maturity-muted">아직 하루치만 모아서 변화는 볼 수 없어요. 매일 모으고 있으니 며칠 뒤에 다시 와 보세요.</p>}
        <RateLine option={option} />
        <details>
          <summary>날짜별 금리 표로 보기</summary>
          <table className="admin-table">
            <thead><tr><th>날짜</th><th>기본금리</th><th>우대 포함</th></tr></thead>
            <tbody>{[...option.history].reverse().map((point) => <tr key={point.day}><td>{point.day.replaceAll('-', '.')}</td><td>{percent(point.baseRate)}</td><td>{percent(point.maxRate)}</td></tr>)}</tbody>
          </table>
        </details>
        <p className="maturity-muted">공시월 {option.disclosedMonth.slice(0, 4)}.{option.disclosedMonth.slice(4, 6)}</p>
      </section>

      {detail.terms && <section className="maturity-step" aria-labelledby="pd-terms">
        <h2 id="pd-terms">가입 조건</h2>
        <dl className="deposit-terms">
          {detail.terms.joinMember && <><dt>가입 대상</dt><dd className="deposit-terms__text">{detail.terms.joinMember}</dd></>}
          {detail.terms.joinWay && <><dt>가입 방법</dt><dd>{detail.terms.joinWay}</dd></>}
          {detail.terms.maxLimit !== null && <><dt>가입 한도</dt><dd>{formatKrwExact(detail.terms.maxLimit)}</dd></>}
          {detail.terms.specialConditions && <><dt>우대 조건</dt><dd className="deposit-terms__text">{detail.terms.specialConditions}</dd></>}
          {detail.terms.maturityInterest && <><dt>만기 후 이자</dt><dd className="deposit-terms__text">{detail.terms.maturityInterest}</dd></>}
          {detail.terms.etcNote && <><dt>유의 사항</dt><dd className="deposit-terms__text">{detail.terms.etcNote}</dd></>}
        </dl>
      </section>}

      <ul className="deposit-notes">{detail.notes.map((note) => <li key={note}>{note}</li>)}</ul>
      <p className="maturity-muted">출처 <a href={detail.sourceUrl} target="_blank" rel="noreferrer">{detail.sourceName} ↗</a></p>
    </>}
  </section>
}
