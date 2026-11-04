import { RULES, type IncomeKind } from './eligibilityRules'

// What the visitor says about being a target of the youth savings, kept in this browser. It is either picked by hand or
// set from the check below (judgeYouthEligibility), which only restates the published rules.
export type YouthEligibility = 'eligible' | 'not_eligible' | 'checking'

export const ELIGIBILITY_KEY = 'very-rich:youth-eligibility:v1'
export const YOUTH_OFFICIAL_URL = 'https://www.kinfa.or.kr/financialProduct/youthFutureSavings.do'
export const YOUTH_OFFICIAL_NAME = '서민금융진흥원 청년미래적금 안내'

export const RULES_SOURCE_NAME = RULES.sourceName
export const RULES_SOURCE_URL = RULES.sourceUrl
export const RULES_ROUND = RULES.round
export const MAX_TABLE_HOUSEHOLD = RULES.maxListedHousehold

export interface EligibilityInput {
  birthDate: string  // YYYY-MM-DD
  militaryMonths: number
  kind: IncomeKind
  amount: number  // 만원: last year's 총급여, 종합소득금액 or 연매출 depending on kind
  smallCompany: boolean  // works at a small or medium company
  householdSize: number  // MAX_TABLE_HOUSEHOLD + 1 stands for more than the table lists
  couple: boolean  // the household is only the visitor and a spouse
  householdIncome: number  // 만원, last year, all members together
  hasYouthAccount?: boolean  // already has a 청년도약계좌
}

export type EligibilityVerdict = 'preferred' | 'general' | 'tax_only' | 'duplicate' | 'not_eligible'

export interface EligibilityResult {
  verdict: EligibilityVerdict
  lines: string[]
  householdChecked: boolean
}

export function ageOn(birthDate: string, today: Date, militaryMonths = 0): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate)
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const served = Math.min(Math.max(Math.trunc(militaryMonths) || 0, 0), RULES.maxMilitaryMonths)
  // Service time is not counted, so the age is taken as of that many months earlier.
  const asOf = new Date(today.getFullYear(), today.getMonth() - served, today.getDate())
  let age = asOf.getFullYear() - year
  if (asOf.getMonth() + 1 < month || (asOf.getMonth() + 1 === month && asOf.getDate() < day)) age -= 1
  return age
}

// 이/가 after a word, by whether its last syllable has a final consonant.
function subject(word: string) {
  const code = word.charCodeAt(word.length - 1) - 0xac00
  return code >= 0 && code % 28 === 0 ? '가' : '이'
}

// 을/를 after a word, by whether its last syllable has a final consonant.
export function objectMark(word: string) {
  const code = word.charCodeAt(word.length - 1) - 0xac00
  return code >= 0 && code % 28 === 0 ? '를' : '을'
}

function won(manwon: number) {
  return `${manwon.toLocaleString('ko-KR')}만원`
}

export function judgeYouthEligibility(input: EligibilityInput, today = new Date()): EligibilityResult | null {
  const result = judgeRules(input, today)
  if (result && input.hasYouthAccount && result.verdict !== 'not_eligible') {
    return {
      ...result, verdict: 'duplicate',
      lines: [...result.lines, '청년도약계좌와 청년미래적금은 중복 가입이 안 돼요. 도약계좌를 해지하고 갈아타는 방법은 공식 안내에서 확인해 주세요.'],
    }
  }
  return result
}

function judgeRules(input: EligibilityInput, today: Date): EligibilityResult | null {
  const age = ageOn(input.birthDate, today, input.militaryMonths)
  if (age === null || age < 0) return null
  const lines: string[] = []
  const no = (reason: string, householdChecked = false): EligibilityResult => ({ verdict: 'not_eligible', lines: [...lines, reason], householdChecked })

  if (age < RULES.minAge || age > RULES.maxAge) return no(`나이가 만 ${age}세로 가입 대상(만 ${RULES.minAge}~${RULES.maxAge}세)이 아니에요.`)
  const served = Math.min(Math.max(Math.trunc(input.militaryMonths) || 0, 0), RULES.maxMilitaryMonths)
  const realAge = ageOn(input.birthDate, today)
  lines.push(served > 0 && realAge !== null
    ? `나이: 실제 만 ${realAge}세에서 병역 ${served}개월을 빼 ${age}세로 계산해요 — 가입 대상(만 ${RULES.minAge}~${RULES.maxAge}세)이에요.`
    : `나이: 만 ${age}세 — 가입 대상(만 ${RULES.minAge}~${RULES.maxAge}세)이에요.`)

  const limits = RULES.income[input.kind]
  if (input.amount > limits.max) return no(`${limits.label}${subject(limits.label)} ${won(limits.max)}을 넘어요.`)
  lines.push(`${limits.label}: ${won(input.amount)} — ${won(limits.max)} 이하예요.`)

  // Household income: compared with the monthly median income times twelve and the share the rule allows.
  const median = RULES.medianIncome[input.householdSize]
  const couple = input.couple && input.householdSize === 2
  const share = couple ? RULES.coupleHouseholdShare : RULES.householdShare
  const householdChecked = median !== undefined
  let householdPreferred = false  // unknown household income cannot confirm the preferred type
  if (householdChecked) {
    const annualMedian = (median * 12) / 10000
    const generalLimit = Math.floor((annualMedian * share.general) / 100)
    const preferredLimit = Math.floor((annualMedian * share.preferred) / 100)
    householdPreferred = input.householdIncome <= preferredLimit
    if (input.householdIncome > generalLimit) return no(`가구소득 ${won(input.householdIncome)}이 기준 중위소득 ${share.general}%(연 ${won(generalLimit)})를 넘어요.`, true)
    lines.push(`가구소득: ${won(input.householdIncome)} — 중위소득 ${share.general}%(연 ${won(generalLimit)}) 이하예요.`)
  } else {
    lines.push(`가구소득: 가구원이 ${RULES.maxListedHousehold + 1}명 이상이면 기준 금액을 확인하지 못해 계산하지 않았어요. 가입하는 은행에서 확인해 주세요.`)
  }

  if (input.amount > limits.general) {
    return { verdict: 'tax_only', lines: [...lines, `${limits.label}${subject(limits.label)} ${won(limits.general)}을 넘으면 정부 기여금은 없고 이자소득 비과세만 받아요.`], householdChecked }
  }
  const smallOk = !limits.needsSmallCompany || input.smallCompany
  if (smallOk && input.amount <= limits.preferred && householdPreferred) {
    lines.push(`우대형 조건(${limits.needsSmallCompany ? '중소기업 재직자' : '소상공인'}, ${limits.label} ${won(limits.preferred)} 이하, 가구 중위소득 ${share.preferred}% 이하)에 맞아요.`)
    return { verdict: 'preferred', lines, householdChecked }
  }
  // How to reach the preferred type, from what is missing.
  const missing: string[] = []
  if (!smallOk) missing.push('중소기업에 재직 중이어야 해요')
  if (input.amount > limits.preferred) missing.push(`${limits.label}${subject(limits.label)} ${won(limits.preferred)} 이하여야 해요`)
  if (!householdChecked) missing.push('가구소득이 기준 이하인지 은행에서 확인해야 해요')
  else if (!householdPreferred) missing.push(`가구소득이 중위소득 ${share.preferred}% 이하여야 해요`)
  if (missing.length) lines.push(`우대형이 되려면: ${missing.join(', ')}.`)
  return { verdict: 'general', lines, householdChecked }
}

export function verdictToAnswer(verdict: EligibilityVerdict): YouthEligibility {
  if (verdict === 'not_eligible') return 'not_eligible'
  return verdict === 'duplicate' ? 'checking' : 'eligible'
}

const VALUES: YouthEligibility[] = ['eligible', 'not_eligible', 'checking']

export function loadEligibility(): YouthEligibility | null {
  try {
    const value = window.localStorage.getItem(ELIGIBILITY_KEY)
    return VALUES.includes(value as YouthEligibility) ? (value as YouthEligibility) : null
  } catch {
    return null
  }
}

export function saveEligibility(value: YouthEligibility) {
  try {
    window.localStorage.setItem(ELIGIBILITY_KEY, value)
  } catch {
    // Storage blocked: the answer only lasts for this visit.
  }
}
