// The published rules of the youth future savings, kept in one place so a new enrolment round only changes this file.
// Amounts are in 만원 per year and income is judged on the year before enrolment.
export const RULES = {
  round: '2차 가입(2026년 10월)',
  sourceName: '금융위원회 보도자료 "10월 7일부터 청년미래적금 2차 가입 신청을 받습니다"',
  sourceUrl: 'https://fsc.go.kr/no010101/87726',
  minAge: 19,
  maxAge: 34,
  maxMilitaryMonths: 72,
  // Household income is compared with the 기준 중위소득 for the household size (monthly 원, 2026, 보건복지부 고시).
  // Seven or more people are not listed because the published figures disagree; the bank decides those.
  medianIncome: { 1: 2564238, 2: 4199292, 3: 5359036, 4: 6494738, 5: 7556719, 6: 8555952 } as Record<number, number>,
  maxListedHousehold: 6,
  householdShare: { general: 200, preferred: 150 },
  // Two people who are only the visitor and a spouse get a wider share.
  coupleHouseholdShare: { general: 250, preferred: 200 },
  income: {
    // max: above this there is no enrolment; general: up to this the 일반형 contribution; preferred: the 우대형 limit.
    worker: { label: '총급여', max: 7500, general: 6000, preferred: 3600, needsSmallCompany: true },
    income: { label: '종합소득금액', max: 6300, general: 4800, preferred: 2600, needsSmallCompany: true },
    business: { label: '연매출', max: 30000, general: 30000, preferred: 10000, needsSmallCompany: false },
  },
} as const

export type IncomeKind = keyof typeof RULES.income
