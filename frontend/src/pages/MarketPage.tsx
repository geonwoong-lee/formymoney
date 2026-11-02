import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { getMarket, type MarketItem, type MarketResponse } from '../api/client'
import { ErrorNotice } from '../components/ErrorNotice'
import './MarketPage.css'

type TrendPoint = MarketResponse['rateTrend'][number]

const TREND_SERIES = [
  { key: 'baseRate', label: '기준금리', className: 'market-trend__line--base' },
  { key: 'depositRate', label: '예금 평균금리', className: 'market-trend__line--deposit' },
  { key: 'cpiYoy', label: '소비자물가 상승률', className: 'market-trend__line--cpi' },
] as const

// Direct labels sit near each line's end; nudge them apart so close values do not overlap.
const LABEL_OFFSET: Record<(typeof TREND_SERIES)[number]['key'], number> = { baseRate: 12, depositRate: -4, cpiYoy: 26 }

function trendValue(point: TrendPoint, key: (typeof TREND_SERIES)[number]['key']) {
  return point[key] ?? null
}

function formatPeriod(period: string) {
  const year = Number(period.slice(0, 4))
  const month = Number(period.slice(4, 6))
  return period.length === 8 ? `${year}년 ${month}월 ${Number(period.slice(6, 8))}일` : `${year}년 ${month}월`
}

function formatNumber(value: string, digits = 2) {
  return Number(value).toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: digits })
}

function formatValue(item: MarketItem) {
  if (item.unit === '%') return `${formatNumber(item.value)}%`
  if (item.unit === '원') return `${formatNumber(item.value)}원`
  return formatNumber(item.value)
}

function Change({ item }: { item: MarketItem }) {
  if (item.change === null || item.previousPeriod === null) return <span className="market-change">비교할 이전 값 없음</span>
  const change = Number(item.change)
  const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'flat'
  const sign = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '−'
  const amount = item.unit === '%' ? `${formatNumber(String(Math.abs(change)))}%p` : formatNumber(String(Math.abs(change)))
  const percent = item.unit !== '%' && item.changePercent !== null ? ` (${formatNumber(String(Math.abs(Number(item.changePercent))))}%)` : ''
  return <span className={`market-change market-change--${direction}`}>
    {sign} {direction === 'flat' ? '변동 없음' : `${amount}${percent}`}
    <span className="market-muted market-change__base">{formatPeriod(item.previousPeriod)} 대비</span>
  </span>
}

function RateTrend({ points }: { points: TrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const width = 640
  const height = 240
  const pad = { top: 16, right: 140, bottom: 30, left: 44 }
  const values = points.flatMap((point) => TREND_SERIES.map((series) => trendValue(point, series.key))).filter((value): value is string => value !== null).map(Number)
  if (points.length < 2 || values.length === 0) return null
  const low = Math.floor(Math.min(...values) * 2) / 2 - 0.5
  const high = Math.ceil(Math.max(...values) * 2) / 2 + 0.5
  const ticks = Array.from({ length: Math.round((high - low) / 0.5) + 1 }, (_, index) => low + index * 0.5)
  const x = (index: number) => pad.left + (index / (points.length - 1)) * (width - pad.left - pad.right)
  const y = (value: number) => pad.top + ((high - value) / (high - low)) * (height - pad.top - pad.bottom)
  const labelEvery = Math.ceil(points.length / 6)

  function path(key: (typeof TREND_SERIES)[number]['key']) {
    // A missing month breaks the line instead of bridging it, so no trend is drawn where there is no data.
    let line = ''
    let drawing = false
    points.forEach((point, index) => {
      const value = trendValue(point, key)
      if (value === null) { drawing = false; return }
      line += `${drawing ? 'L' : 'M'}${x(index).toFixed(1)} ${y(Number(value)).toFixed(1)}`
      drawing = true
    })
    return line
  }

  function lastIndex(key: (typeof TREND_SERIES)[number]['key']) {
    for (let index = points.length - 1; index >= 0; index -= 1) if (trendValue(points[index], key) !== null) return index
    return -1
  }

  function track(event: ReactPointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    const position = ((event.clientX - bounds.left) / bounds.width) * width
    const index = Math.round(((position - pad.left) / (width - pad.left - pad.right)) * (points.length - 1))
    setHover(Math.min(points.length - 1, Math.max(0, index)))
  }

  const hovered = hover === null ? null : points[hover]
  return <section className="market-trend" aria-labelledby="market-trend-title">
    <h2 id="market-trend-title">금리·물가 흐름 (최근 {points.length}개월)</h2>
    <ul className="market-trend__legend" aria-label="범례">
      {TREND_SERIES.map((series) => <li key={series.key}><span className={`market-trend__swatch ${series.className}`} aria-hidden="true" />{series.label}</li>)}
    </ul>
    <div className="market-trend__plot" tabIndex={0} aria-label="금리 흐름 그래프, 좁은 화면에서는 옆으로 밀어 볼 수 있습니다">
      <div className="market-trend__canvas">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="한국은행 기준금리, 은행 예금 평균금리, 소비자물가 상승률의 월별 추이" onPointerMove={track} onPointerLeave={() => setHover(null)}>
        {ticks.map((tick) => <g key={tick}>
          <line className="market-trend__grid" x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} />
          <text className="market-trend__axis" x={pad.left - 6} y={y(tick) + 4} textAnchor="end">{tick.toFixed(1)}%</text>
        </g>)}
        {points.map((point, index) => index % labelEvery === 0 || index === points.length - 1
          ? <text key={point.period} className="market-trend__axis" x={x(index)} y={height - 8} textAnchor="middle">{`${point.period.slice(2, 4)}.${point.period.slice(4, 6)}`}</text>
          : null)}
        {TREND_SERIES.map((series) => {
          const last = lastIndex(series.key)
          return <g key={series.key}>
            <path className={`market-trend__line ${series.className}`} d={path(series.key)} />
            {last >= 0 && <text className="market-trend__label" x={x(last) + 8} y={y(Number(trendValue(points[last], series.key))) + LABEL_OFFSET[series.key]}>{series.label} {formatNumber(trendValue(points[last], series.key) as string)}%</text>}
          </g>
        })}
        {hovered && hover !== null && <g>
          <line className="market-trend__crosshair" x1={x(hover)} x2={x(hover)} y1={pad.top} y2={height - pad.bottom} />
          {TREND_SERIES.map((series) => trendValue(hovered, series.key) !== null && <circle key={series.key} className={`market-trend__dot ${series.className}`} cx={x(hover)} cy={y(Number(trendValue(hovered, series.key)))} r={4.5} />)}
        </g>}
      </svg>
      {hovered && hover !== null && <div className="market-trend__tooltip" style={{ left: `${Math.min(82, Math.max(18, (x(hover) / width) * 100))}%` }} role="status">
        <b>{formatPeriod(hovered.period)}</b>
        {TREND_SERIES.map((series) => <span key={series.key}>{series.label} {trendValue(hovered, series.key) === null ? '자료 없음' : `${formatNumber(trendValue(hovered, series.key) as string)}%`}</span>)}
      </div>}
      </div>
    </div>
    <details className="market-trend__table">
      <summary>표로 보기</summary>
      <table>
        <thead><tr><th scope="col">월</th>{TREND_SERIES.map((series) => <th scope="col" key={series.key}>{series.label}</th>)}</tr></thead>
        <tbody>{points.map((point) => <tr key={point.period}><th scope="row">{formatPeriod(point.period)}</th>{TREND_SERIES.map((series) => <td key={series.key}>{trendValue(point, series.key) === null ? '–' : `${formatNumber(trendValue(point, series.key) as string)}%`}</td>)}</tr>)}</tbody>
      </table>
    </details>
    {points.some((point) => TREND_SERIES.some((series) => trendValue(point, series.key) === null)) && <p className="market-muted">자료가 없는 달은 선을 끊어 표시합니다.</p>}
    <p className="market-muted">지난 기록이며 앞으로의 금리와 물가를 예측하지 않습니다. 예금 평균금리는 은행이 그달 새로 받은 저축성 예금의 가중평균 금리이고, 소비자물가 상승률은 전년 같은 달 대비입니다.</p>
  </section>
}

export function MarketPage() {
  const [data, setData] = useState<MarketResponse | null>(null)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    getMarket(controller.signal).then(setData).catch((cause: unknown) => {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      setError(cause instanceof Error ? cause.message : '시장 지표를 불러오지 못했습니다.')
    })
    return () => controller.abort()
  }, [reloadKey])

  return (
    <section className="page page--wide market-page">
      <p className="eyebrow">Market</p>
      <h1>시장 지표</h1>
      <p className="lead">환율, 증시, 금리, 물가를 한국은행 공식 통계로 보여 줍니다. 하루 한 번 갱신하는 지난 값이며 실시간 시세가 아닙니다. 투자·가입 권유가 아닙니다.</p>

      {error && <ErrorNotice message={error} onRetry={() => { setError(''); setData(null); setReloadKey((key) => key + 1) }} />}
      {!data && !error && <p className="notice">시장 지표를 불러오는 중입니다.</p>}

      {data && data.groups.length === 0 && <p className="notice">아직 수집된 시장 지표가 없습니다.</p>}
      {data && data.groups.map((group) => <section className="market-group" key={group.key} aria-labelledby={`market-${group.key}`}>
        <h2 id={`market-${group.key}`}>{group.title}</h2>
        <ul className="market-cards">
          {group.items.map((item) => <li className="market-card" key={item.code}>
            <span className="market-card__name">{item.name}</span>
            <b className="market-card__value">{formatValue(item)}</b>
            <Change item={item} />
            <span className="market-muted">{item.cycle === 'D' ? `${formatPeriod(item.period)} 기준` : `${formatPeriod(item.period)} 기준(월)`}</span>
          </li>)}
        </ul>
        <p className="market-muted">{group.note}</p>
      </section>)}

      {data && <RateTrend points={data.rateTrend} />}

      {data && data.groups.length > 0 && <p className="market-muted market-source">
        출처: <a href={data.sourceUrl} target="_blank" rel="noreferrer">{data.sourceName} ↗</a>
        {data.updatedAt && ` · 마지막 수집 ${new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(data.updatedAt))}`}
      </p>}
    </section>
  )
}
