// What the visitor says about being a target of the youth savings, kept in this browser. It is either picked by hand or
// set from the check below (judgeYouthEligibility), which only restates the published rules.
export type YouthEligibility = 'eligible' | 'not_eligible' | 'checking'

export const ELIGIBILITY_KEY = 'very-rich:youth-eligibility:v1'
export const YOUTH_OFFICIAL_URL = 'https://www.kinfa.or.kr/financialProduct/youthFutureSavings.do'
export const YOUTH_OFFICIAL_NAME = '서민금융진흥원 청년미래적금 안내'

export const RULES_SOURCE_NAME = '금융위원회 보도자료 "10월 7일부터 청년미래적금 2차 가입 신청을 받습니다"'
export const RULES_SOURCE_URL = 'https://fsc.go.kr/no010101/87726'

// Published rules (2nd enrolment round, 2026-10; income is judged on the year before). Amounts are in 만원 per year.
const MIN_AGE = 19
const MAX_AGE = 34
const MAX_MILITARY_MONTHS = 72
const GENERAL_SALARY_LIMIT = 6000
const NO_CONTRIBUTION_SALARY_LIMIT = 7500
const PREFERRED_SALARY_LIMIT = 3600
const GENERAL_SALES_LIMIT = 30000
const PREFERRED_SALES_LIMIT = 10000
// 2026 기준 중위소득 (monthly, 원). Households of five or more are not in the table: the bank decides those.
const MEDIAN_INCOME: Record<number, number> = { 1: 2564238, 2: 4199292, 3: 5359036, 4: 6494738 }
export const MAX_TABLE_HOUSEHOLD = 4

export interface EligibilityInput {
  birthDate: string  // YYYY-MM-DD
  militaryMonths: number
  kind: 'worker' | 'business'
  amount: number  // 만원: last year's 총급여 for a worker, 연매출 for a small business
  smallCompany: boolean  // a worker at a small or medium company
  householdSize: number  // 5 stands for five or more
  couple: boolean  // the household is only the visitor and a spouse
  householdIncome: number  // 만원, last year, all members together
}

export type EligibilityVerdict = 'preferred' | 'general' | 'tax_only' | 'not_eligible'

export interface EligibilityResult {
  verdict: EligibilityVerdict
  lines: string[]
  householdChecked: boolean
}

export function ageOn(birthDate: string, today: Date, militaryMonths = 0): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate)
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const served = Math.min(Math.max(Math.trunc(militaryMonths) || 0, 0), MAX_MILITARY_MONTHS)
  // Service time is not counted, so the age is taken as of that many months earlier.
  const asOf = new Date(today.getFullYear(), today.getMonth() - served, today.getDate())
  let age = asOf.getFullYear() - year
  if (asOf.getMonth() + 1 < month || (asOf.getMonth() + 1 === month && asOf.getDate() < day)) age -= 1
  return age
}

function won(manwon: number) {
  return `${manwon.toLocaleString('ko-KR')}만원`
}

export function judgeYouthEligibility(input: EligibilityInput, today = new Date()): EligibilityResult | null {
  const age = ageOn(input.birthDate, today, input.militaryMonths)
  if (age === null || age < 0) return null
  const lines: string[] = []
  const no = (reason: string, householdChecked = false): EligibilityResult => ({ verdict: 'not_eligible', lines: [...lines, reason], householdChecked })

  if (age < MIN_AGE || age > MAX_AGE) return no(`나이가 만 ${age}세로 가입 대상(만 ${MIN_AGE}~${MAX_AGE}세)이 아니에요.`)
  const served = Math.min(Math.max(Math.trunc(input.militaryMonths) || 0, 0), MAX_MILITARY_MONTHS)
  const realAge = ageOn(input.birthDate, today)
  lines.push(served > 0 && realAge !== null
    ? `나이: 실제 만 ${realAge}세에서 병역 ${served}개월을 빼 ${age}세로 계산해요 — 가입 대상(만 ${MIN_AGE}~${MAX_AGE}세)이에요.`
    : `나이: 만 ${age}세 — 가입 대상(만 ${MIN_AGE}~${MAX_AGE}세)이에요.`)

  const worker = input.kind === 'worker'
  const incomeLimit = worker ? NO_CONTRIBUTION_SALARY_LIMIT : GENERAL_SALES_LIMIT
  const incomeName = worker ? '총급여' : '연매출'
  if (input.amount > incomeLimit) return no(`${incomeName}가 ${won(incomeLimit)}를 넘어요.`)
  lines.push(`${incomeName}: ${won(input.amount)} — ${won(incomeLimit)} 이하예요.`)

  // Household income: compared with the monthly median income times twelve and the share the rule allows.
  const median = MEDIAN_INCOME[input.householdSize]
  const couple = input.couple && input.householdSize === 2
  const generalShare = couple ? 250 : 200
  const preferredShare = couple ? 200 : 150
  const householdChecked = median !== undefined
  let householdGeneral = true
  let householdPreferred = false  // unknown household income cannot confirm the preferred type
  if (householdChecked) {
    const annualMedian = (median * 12) / 10000
    const generalLimit = Math.floor((annualMedian * generalShare) / 100)
    const preferredLimit = Math.floor((annualMedian * preferredShare) / 100)
    householdGeneral = input.householdIncome <= generalLimit
    householdPreferred = input.householdIncome <= preferredLimit
    if (!householdGeneral) return no(`가구소득 ${won(input.householdIncome)}이 기준 중위소득 ${generalShare}%(연 ${won(generalLimit)})를 넘어요.`, true)
    lines.push(`가구소득: ${won(input.householdIncome)} — 중위소득 ${generalShare}%(연 ${won(generalLimit)}) 이하예요.`)
  } else {
    lines.push('가구소득: 가구원이 5명 이상이면 기준 금액을 확인하지 못해 계산하지 않았어요. 가입하는 은행에서 확인해 주세요.')
  }

  if (worker && input.amount > GENERAL_SALARY_LIMIT) {
    return { verdict: 'tax_only', lines: [...lines, `총급여가 ${won(GENERAL_SALARY_LIMIT)}를 넘으면 정부 기여금은 없고 이자소득 비과세만 받아요.`], householdChecked }
  }
  const preferredIncome = worker ? input.smallCompany && input.amount <= PREFERRED_SALARY_LIMIT : input.amount <= PREFERRED_SALES_LIMIT
  if (preferredIncome && householdPreferred) {
    lines.push(`우대형 조건(${worker ? `중소기업 재직자, 총급여 ${won(PREFERRED_SALARY_LIMIT)} 이하` : `소상공인, 연매출 ${won(PREFERRED_SALES_LIMIT)} 이하`}, 가구 중위소득 ${preferredShare}% 이하)에 맞아요.`)
    return { verdict: 'preferred', lines, householdChecked }
  }
  // How to reach the preferred type, from what is missing.
  const missing: string[] = []
  if (worker) {
    if (!input.smallCompany) missing.push('중소기업에 재직 중이어야 해요')
    if (input.amount > PREFERRED_SALARY_LIMIT) missing.push(`총급여가 ${won(PREFERRED_SALARY_LIMIT)} 이하여야 해요`)
  } else if (input.amount > PREFERRED_SALES_LIMIT) missing.push(`연매출이 ${won(PREFERRED_SALES_LIMIT)} 이하여야 해요`)
  if (!householdChecked) missing.push('가구소득이 기준 이하인지 은행에서 확인해야 해요')
  else if (!householdPreferred) missing.push(`가구소득이 중위소득 ${preferredShare}% 이하여야 해요`)
  if (missing.length) lines.push(`우대형이 되려면: ${missing.join(', ')}.`)
  return { verdict: 'general', lines, householdChecked }
}

export function verdictToAnswer(verdict: EligibilityVerdict): YouthEligibility {
  return verdict === 'not_eligible' ? 'not_eligible' : 'eligible'
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
