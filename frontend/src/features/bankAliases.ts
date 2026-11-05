// The names people type for a bank are not always the ones 금융감독원 discloses: "KB" for 국민은행, "NH" for 농협은행주식회사,
// "IBK" for 중소기업은행. Each row lists words that mean the same company (lower case); typing one finds the others too.
const ALIAS_GROUPS: string[][] = [
  ['kb', '국민', '케이비'],
  ['nh', '농협', '엔에이치'],
  ['ibk', '기업', '중소기업'],
  ['sc', '스탠다드차타드', 'sc제일'],
  ['im', '아이엠', '대구'],
  ['kdb', '산업'],
  ['케이뱅크', 'kbank', 'k뱅크'],
  ['카카오', 'kakao'],
  ['토스', 'toss'],
  ['bnk', '비엔케이'],
  ['sbi', '에스비아이'],
  ['ok', '오케이'],
  ['db', '디비'],
  ['dh', '디에이치'],
  ['hb', '에이치비'],
  ['jt', '제이티'],
  ['ms', '엠에스'],
  ['osb', '오에스비'],
  ['ck', '씨케이'],
]

// One company name that stands for several (BNK is the group of 부산은행 and 경남은행); the other way round does not hold.
const GROUP_NAMES: Record<string, string[]> = { bnk: ['부산', '경남'], '비엔케이': ['부산', '경남'] }

/** What to look for in a company name when the visitor types `query`: the text itself, plus its aliases when it is exactly one. */
export function bankSearchTerms(query: string): string[] {
  const text = query.trim().toLowerCase()
  if (!text) return []
  const aliases = ALIAS_GROUPS.filter((group) => group.includes(text)).flat()
  return [...new Set([text, ...aliases, ...(GROUP_NAMES[text] ?? [])])]
}

export function companyMatches(company: string, terms: string[]): boolean {
  const name = company.toLowerCase()
  return terms.some((term) => name.includes(term))
}
