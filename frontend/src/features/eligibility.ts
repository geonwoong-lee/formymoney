// What the visitor says about being a target of the youth savings. The site does not decide this: the age and income
// rules are the policy body's to state, so the answer is the visitor's own and stays in this browser.
export type YouthEligibility = 'eligible' | 'not_eligible' | 'checking'

export const ELIGIBILITY_KEY = 'very-rich:youth-eligibility:v1'
export const YOUTH_OFFICIAL_URL = 'https://www.kinfa.or.kr/financialProduct/youthFutureSavings.do'
export const YOUTH_OFFICIAL_NAME = '서민금융진흥원 청년미래적금 안내'

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
