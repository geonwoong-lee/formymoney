// Short marks for the compared banks. They are plain letters, not the banks' logos: the logos are trademarks and no
// bank's published terms allow a comparison site to use them, so the badge only helps the eye tell rows apart.
const MARKS: Record<string, string> = {
  kb: 'KB', shinhan: '신한', nh: 'NH', woori: '우리', hana: '하나', ibk: 'IBK', post: '우체국', sh: 'Sh', im: 'iM',
  busan: 'BNK', gwangju: '광주', jeonbuk: '전북', gyeongnam: 'BNK', kakao: '카카오',
}

// For lists that only carry the company's name as 금감원 disclosed it.
const NAME_MARKS: [RegExp, string][] = [
  [/국민/, 'KB'], [/신한/, '신한'], [/농협|NH/, 'NH'], [/우리/, '우리'], [/하나/, '하나'], [/중소기업|IBK|기업은행/, 'IBK'],
  [/수협|Sh/, 'Sh'], [/아이엠|iM/, 'iM'], [/부산|경남/, 'BNK'], [/광주/, '광주'], [/전북/, '전북'], [/카카오/, '카카오'],
  [/케이뱅크/, 'K'], [/토스/, '토스'], [/스탠다드|SC제일/, 'SC'], [/제주/, '제주'], [/대구/, '대구'],
]

export function bankMark(bankCode: string | undefined, bankName: string): string {
  if (bankCode && MARKS[bankCode]) return MARKS[bankCode]
  const known = NAME_MARKS.find(([pattern]) => pattern.test(bankName))
  if (known) return known[1]
  const letters = bankName.replace(/\([^)]*\)|주식회사|\s/g, '')
  return letters.slice(0, 2) || '?'
}
