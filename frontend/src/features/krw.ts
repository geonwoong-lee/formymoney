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

const WON_UNITS: Record<string, number> = { 억: 100_000_000, 천만: 10_000_000, 백만: 1_000_000, 만: 10_000, 천: 1_000, 백: 100 }
const WON_EXPRESSION = /^(?:\d+(?:\.\d+)?(?:억|천만|백만|만|천|백)?)+$/

/**
 * Reads an amount the way people write it in Korean: "30만원" (300,000), "1.5억" (150,000,000), "3천만원", "1억5천" (spoken for 1억 5천만).
 * Full-width digits and commas are accepted. Returns null when the text is not an amount; a plain number is left to the caller.
 */
export function parseKoreanWon(text: string): number | null {
  const cleaned = text.normalize('NFKC').replace(/[,\s]/g, '').replace(/원$/, '')
  if (!WON_EXPRESSION.test(cleaned)) return null
  let total = 0
  let afterEok = false
  for (const [, number, unit] of cleaned.matchAll(/(\d+(?:\.\d+)?)(억|천만|백만|만|천|백)?/g)) {
    // After 억 a bare 천 means 천만 ("1억5천"), not 천.
    const effective = afterEok && unit === '천' ? '천만' : unit
    total += Number(number) * (effective ? WON_UNITS[effective] : 1)
    afterEok = unit === '억'
  }
  return Number.isFinite(total) ? Math.round(total) : null
}
