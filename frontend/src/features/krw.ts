import type { PeerRange } from '../api/client'

// Large won amounts the way Korean statements are read: 563조 5,926억 원, 4,224억 원.
const JO = 1_000_000_000_000
const EOK = 100_000_000

export function formatKrwLarge(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '–'
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '–'
  const sign = amount < 0 ? '−' : ''
  const absolute = Math.abs(amount)
  const jo = Math.floor(absolute / JO)
  const eok = Math.round((absolute - jo * JO) / EOK)
  if (jo > 0) return `${sign}${jo.toLocaleString('ko-KR')}조${eok ? ` ${eok.toLocaleString('ko-KR')}억` : ''} 원`
  if (eok > 0) return `${sign}${eok.toLocaleString('ko-KR')}억 원`
  return `${sign}${Math.round(absolute).toLocaleString('ko-KR')}원`
}

export function formatChangePercent(value: string | null): string {
  if (value === null) return '–'
  const number = Number(value)
  return `${number > 0 ? '+' : number < 0 ? '−' : ''}${Math.abs(number).toFixed(2)}%`
}

export function peerRangeText(range: PeerRange | undefined): string {
  if (!range || range.count < 2) return ''
  return `이 사이트에 모은 ${range.count}개 은행 중 가장 낮은 곳 ${range.minBank} ${range.min}%, 가장 높은 곳 ${range.maxBank} ${range.max}%`
}

// Exact amounts in 억 and 만 for limits: 10억 원, 1억 5,000만 원, 500만 원, 12,345원. Nothing is rounded away.
export function formatKrwExact(value: number): string {
  const eok = Math.floor(value / EOK)
  const man = Math.floor((value % EOK) / 10_000)
  const rest = value % 10_000
  if (rest || (!eok && !man)) return `${value.toLocaleString('ko-KR')}원`
  return [eok ? `${eok.toLocaleString('ko-KR')}억` : '', man ? `${man.toLocaleString('ko-KR')}만` : ''].filter(Boolean).join(' ') + ' 원'
}
