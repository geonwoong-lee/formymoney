// Bank icons from the Figma Community file "대한민국 은행 · 카드사 로고 모음 (Korea Bank & Card Logo Library)".
// The trademarks belong to the banks; this site is not affiliated with them. A bank without an icon here keeps the
// pixel building (bankPixelIcon.ts).
export const LOGO_SOURCE_NAME = 'Figma Community · 대한민국 은행 · 카드사 로고 모음 (Korea Bank & Card Logo Library)'
export const LOGO_SOURCE_URL = 'https://www.figma.com/design/eQar0ejs8d3rMKowPT0yIF/'

const FILES = import.meta.glob('../assets/banks/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const urlOf = (name: string): string | undefined => FILES[`../assets/banks/${name}.png`]

const BY_CODE: Record<string, string> = {
  kb: 'kb', shinhan: 'shinhan', nh: 'nh', woori: 'woori', hana: 'hana', ibk: 'ibk', post: 'post', sh: 'sh', im: 'im',
  busan: 'busan-gyeongnam', gyeongnam: 'busan-gyeongnam', gwangju: 'gwangju-jeonbuk', jeonbuk: 'gwangju-jeonbuk', kakao: 'kakao',
}

// For lists that only carry the company's name as 금감원 disclosed it. 저축은행 are separate companies and are skipped.
const BY_NAME: [RegExp, string][] = [
  [/국민/, 'kb'], [/신한/, 'shinhan'], [/농협|NH/, 'nh'], [/우리/, 'woori'], [/하나/, 'hana'], [/중소기업|IBK|기업은행/, 'ibk'],
  [/수협|Sh/, 'sh'], [/아이엠|iM/, 'im'], [/부산|경남/, 'busan-gyeongnam'], [/광주|전북/, 'gwangju-jeonbuk'], [/카카오/, 'kakao'],
]

export function bankLogoUrl(bankCode: string | undefined, bankName: string): string | undefined {
  if (bankCode && BY_CODE[bankCode]) return urlOf(BY_CODE[bankCode])
  if (bankName.includes('저축')) return undefined
  const known = BY_NAME.find(([pattern]) => pattern.test(bankName))
  return known ? urlOf(known[1]) : undefined
}
