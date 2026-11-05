import type { AssistantProfile } from '../features/assistantProfile'
import type { VeryRichDraft } from '../storage/draftStorage'
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export interface HealthResponse {
  status: 'ok'
  app: string
  database: 'ok'
  referenceKey: string
}

export interface AuthUser {
  id: string
  email: string
  displayName: string | null
  createdAt: string | null
}

export interface AuthSessionResponse {
  user: AuthUser
  accessToken: string | null
  refreshToken: string | null
  expiresIn: number | null
  tokenType: 'bearer'
  needsEmailConfirmation: boolean
}

export type ConditionAnswer = 'yes' | 'no' | 'unknown'
export type ContributionType = 'none' | 'general' | 'preferred'

export interface SavingsCondition {
  code: string
  title: string
  bonusRate: number
  description: string
  question: string
  requiresAdditionalReview: boolean
}

export interface SavingsProduct {
  bankCode: string
  bankName: string
  productName: string
  baseRate: number
  maximumRate: number
  sourceUrl: string
  sourceDate: string
  conditions: SavingsCondition[]
}

export interface SavingsProductsResponse {
  policy: {
    termMonths: number
    minimumMonthlyAmount: number
    maximumMonthlyAmount: number
    generalContributionRate: number
    preferredContributionRate: number
    taxExempt: boolean
  }
  products: SavingsProduct[]
}

export interface ConditionResult {
  code: string
  title: string
  bonusRate: number
  answer: ConditionAnswer
  status: string
  appliedBonusRate: number
  reason: string
}

export interface BankCalculationResult {
  bankCode: string
  bankName: string
  productName: string
  baseRate: number
  maximumRate: number
  appliedBonusRate: number
  expectedRate: number
  principal: number
  depositInterest: number
  governmentContribution: number
  governmentContributionInterest: number
  expectedMaturityAmount: number
  differenceFromCurrentBank: number | null
  conditions: ConditionResult[]
  sourceUrl: string
  sourceDate: string
}

export interface SavingsCalculationResponse {
  monthlyAmount: number
  termMonths: number
  contributionType: ContributionType
  taxExempt: boolean
  results: BankCalculationResult[]
}

export interface CashflowCalculationResponse {
  bankCode: string
  termMonths: number
  monthlyAmounts: number[]
  result: BankCalculationResult
  fixedExpectedMaturityAmount: number
  differenceFromFixedPlan: number
}

export interface MonthImpactScenario {
  key: 'keep' | 'reduce' | 'skip'
  label: string
  monthAmount: number
  principal: number
  depositInterest: number
  governmentContribution: number
  governmentContributionInterest: number
  expectedMaturityAmount: number
  differenceFromKeep: number
  depositInterestDifferenceFromKeep: number
  governmentContributionDifferenceFromKeep: number
}

export interface MonthImpactResponse {
  bankCode: string
  bankName: string
  monthNumber: number
  termMonths: number
  expectedRate: number
  scenarios: MonthImpactScenario[]
  unavailableNotes: string[]
  sourceUrl: string
  sourceDate: string
}

export interface EarlyExitScenario {
  key: 'keep' | 'pause' | 'minimum'
  label: string
  futureMonthlyAmount: number | null
  principal: number
  depositInterest: number
  governmentContribution: number
  governmentContributionInterest: number
  expectedMaturityAmount: number
  extraPrincipal: number
  moreThanTermination: number
}

export interface EarlyExitResponse {
  bankCode: string
  bankName: string
  paidMonths: number
  termMonths: number
  monthsLeft: number
  baseRate: number
  expectedRate: number
  interestTaxRate: number
  termination: {
    principal: number
    interestAtBaseRate: number
    interestTax: number
    receivedAtBaseRate: number
    lostGovernmentContribution: number
  }
  scenarios: EarlyExitScenario[]
  specialTerminationReasons: string[]
  specialTerminationSource: string
  specialTerminationSourceUrl: string
  specialTerminationSourceDate: string
  unavailableNotes: string[]
  sourceUrl: string
  sourceDate: string
}

export interface InvestmentAsset {
  code: string
  ticker: string
  name: string
  category: string
  currency: string
  benchmark: string
  leveraged: boolean
  expenseRatioPercent: number
  distributionPolicy: string
  providerSourceUrl: string
  priceSourceUrl: string
  fxSourceUrl: string
  sourceDate: string
  warning: string
  startMonth: string
  endMonth: string
  availableMonths: number
}

export interface InvestmentAssetsResponse {
  assets: InvestmentAsset[]
  taxIncluded: boolean
  tradingFeeIncluded: boolean
  fxIncluded: boolean
  fractionalShares: boolean
}

export interface ComparisonResult {
  kind: 'savings' | 'investment'
  code: string
  name: string
  ticker: string | null
  principal: number
  endingValue: number
  profitLoss: number
  returnPercent: number
  maxDrawdownPercent: number | null
  leveraged: boolean
  warning: string
  sourceUrl: string
  sourceDate: string
  taxTreatment: string
  feeTreatment: string
  fxTreatment: string
}

export interface ComparisonResponse {
  startMonth: string
  endMonth: string
  monthlyAmounts: number[]
  results: ComparisonResult[]
  historicalScenario: boolean
  dividendsReinvested: boolean
  notice: string
}

export interface DailySummaryPoint {
  text: string
  evidenceIds: string[]
}

export interface DailyBriefingItem {
  id: number
  sourceCode: string
  sourceName: string
  sourceItemId: string
  originalTitle: string
  canonicalUrl: string
  publishedAt: string
  generatedAt: string
  plainHeadline: string
  summaryPoints: DailySummaryPoint[]
  whyItMatters: DailySummaryPoint
  relatedTerms: string[]
  caution: string
  aiGenerated: boolean
}

export interface DailyTerm {
  slug: string
  name: string
  shortDefinition: string
  example: string
  sourceName: string
  sourceUrl: string
}

export interface DailyBriefingResponse {
  date: string
  generatedAt: string | null
  items: DailyBriefingItem[]
  term: DailyTerm | null
}

export interface NewsHeadline {
  title: string
  publisher: string
  url: string
  publishedAt: string
  topic: string
  provider: string
  titleKo: string | null
  summaryKo: string | null
  reasons: string[]
}

export interface NewsHeadlinesResponse {
  region: 'domestic' | 'international'
  items: NewsHeadline[]
}

export interface DigestSource {
  title: string
  publisher: string
  url: string
}

export type MoneyNoteCategory = 'new_savings' | 'current_savings' | 'loan' | 'fx'

export interface NewsDigest {
  digestDate: string
  overview: string
  points: { text: string; sources: DigestSource[] }[]
  // null: the digest was written before money notes existed; []: no news reached savers today.
  moneyNotes?: { category: MoneyNoteCategory; text: string; sources: DigestSource[] }[] | null
  aiModel: string
  createdAt: string
}

export type EventKind = 'rate_decision' | 'fomc' | 'statistics' | 'election'

export interface UpcomingEvent {
  key: string
  date: string
  dDay: number
  kind: EventKind
  title: string
  why: string
  sourceName: string
  sourceUrl: string
  checkedOn: string
  tentative: boolean
}

export interface EventsResponse {
  today: string
  items: UpcomingEvent[]
}

export function getEvents(signal?: AbortSignal, days = 60): Promise<EventsResponse> {
  return request<EventsResponse>(`/api/v1/events?days=${days}`, { signal })
}

export interface AccountWatchItem {
  kind: 'deposit' | 'saving'
  company: string
  productCode: string
  productName: string
}

export function getAccountWatchlist(accessToken: string, signal?: AbortSignal): Promise<{ items: AccountWatchItem[]; updatedAt: string | null; limit: number }> {
  return request('/api/v1/me/watchlist', { headers: bearer(accessToken), signal })
}

export function putAccountWatchlist(accessToken: string, items: AccountWatchItem[]): Promise<{ items: AccountWatchItem[]; updatedAt: string | null; limit: number }> {
  return request('/api/v1/me/watchlist', {
    method: 'PUT', headers: { ...bearer(accessToken), 'Content-Type': 'application/json' }, body: JSON.stringify({ items }),
  })
}

export function deleteAccountWatchlist(accessToken: string): Promise<void> {
  return request('/api/v1/me/watchlist', { method: 'DELETE', headers: bearer(accessToken) })
}

export interface SavedPlan {
  id: number
  name: string
  draft: VeryRichDraft
  createdAt: string
  updatedAt: string
}

const bearer = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}` })

export function listSavedPlans(accessToken: string, signal?: AbortSignal): Promise<{ plans: SavedPlan[]; limit: number }> {
  return request('/api/v1/me/plans', { headers: bearer(accessToken), signal })
}

export function savePlan(accessToken: string, name: string, draft: VeryRichDraft): Promise<SavedPlan> {
  return request('/api/v1/me/plans', {
    method: 'POST', headers: { ...bearer(accessToken), 'Content-Type': 'application/json' }, body: JSON.stringify({ name, draft }),
  })
}

export function overwritePlan(accessToken: string, id: number, name: string, draft: VeryRichDraft): Promise<SavedPlan> {
  return request(`/api/v1/me/plans/${id}`, {
    method: 'PUT', headers: { ...bearer(accessToken), 'Content-Type': 'application/json' }, body: JSON.stringify({ name, draft }),
  })
}

export function deletePlan(accessToken: string, id: number): Promise<void> {
  return request(`/api/v1/me/plans/${id}`, { method: 'DELETE', headers: bearer(accessToken) })
}

export function deleteAllPlans(accessToken: string): Promise<void> {
  return request('/api/v1/me/plans', { method: 'DELETE', headers: bearer(accessToken) })
}

export interface FinancialItem {
  key: 'assets' | 'liabilities' | 'equity' | 'deposits' | 'net_interest' | 'net_income'
  label: string
  current: string | null
  previous: string | null
  changePercent: string | null
}

export interface PeerRange {
  count: number
  min: string
  minBank: string
  max: string
  maxBank: string
}

export interface StatementLine {
  key: string | null
  label: string
  amount: string | null
}

export interface StatementSection {
  label: string
  total: string | null
  lines: StatementLine[]
}

export interface BankFinancials {
  bankCode: string
  corpName: string
  year: number
  statement: string
  periodEnd: string
  items: FinancialItem[]
  ratios: { equityToAssets: string | null; depositsToLiabilities: string | null; netIncomeToAssets: string | null }
  peers: Partial<Record<'equityToAssets' | 'depositsToLiabilities' | 'netIncomeToAssets', PeerRange>>
  balanced: boolean | null
  statements: {
    balanceSheet: { assets: StatementSection; liabilities: StatementSection; equity: StatementSection }
    incomeStatement: StatementLine[]
  }
  sourceName: string
  sourceUrl: string
}

export interface DartFiling {
  receiptNo: string
  corpName: string
  title: string
  filedOn: string
  filer: string
  url: string
}

export function getBankFinancials(bankCode: string, signal?: AbortSignal): Promise<BankFinancials> {
  return request<BankFinancials>(`/api/v1/banks/${encodeURIComponent(bankCode)}/financials`, { signal })
}

export function getDartBanks(signal?: AbortSignal): Promise<{ banks: { bankCode: string; corpName: string }[] }> {
  return request('/api/v1/dart/banks', { signal })
}

export function getDartFilings(signal?: AbortSignal, days = 14): Promise<{ items: DartFiling[]; routineBondFilings: number; sourceName: string; sourceUrl: string }> {
  return request(`/api/v1/dart/filings?days=${days}&limit=30`, { signal })
}

export type RiskProfile = 'stable' | 'balanced' | 'aggressive'

export interface HoldingOutcome {
  windows: number
  firstStart: string
  lastStart: string
  averagePercent: string
  bestPercent: string
  worstPercent: string
  lossWindows: number
  averageValue: number
  bestValue: number
  worstValue: number
}

export interface MaturityOption {
  code: string
  name: string
  kind: 'deposit' | 'bond' | 'dividend' | 'index' | 'leveraged'
  riskLevel: number
  riskLabel: string
  principalProtected: boolean
  fitsProfile: boolean
  summary: string
  warning: string
  deposit: { ratePercent: string; ratePeriod: string; interest: number; tax: number; endingValue: number; endingValueAfterTax: number } | null
  history: HoldingOutcome | null
  sourceName: string
  sourceUrl: string
}

export interface MaturityPlanResponse {
  amount: number
  months: number
  profile: RiskProfile
  dataStart: string
  dataEnd: string
  options: MaturityOption[]
  mix: { assetCode: string; assetName: string; depositShare: number; history: HoldingOutcome } | null
  notes: string[]
  checkedOn: string
}

export interface DepositProduct {
  disclosedMonth?: string
  company: string
  productCode: string
  reserveType: string
  productName: string
  rateType: string
  baseRate: string
  maxRate: string | null
  baseAfterTax: number
  maxAfterTax: number | null
  joinWay: string
  joinMember: string
  joinLimit: string
  specialConditions: string
  maxLimit: number | null
  overLimit: boolean
  etcNote: string
  maturityInterest: string
}

export interface DepositRatePoint {
  ratePercent: string
  afterTax: number
}

export interface RateContext {
  baseRate: string | null
  baseRatePeriod: string | null
  depositAverage: string | null
  depositAveragePeriod: string | null
  inflation: string | null
  inflationPeriod: string | null
}

export interface DepositProductsResponse {
  amount: number
  months: number
  group: string
  day: string | null
  count: number
  principal: number | null
  lowest: DepositRatePoint | null
  middle: DepositRatePoint | null
  highest: DepositRatePoint | null
  products: DepositProduct[]
  notes: string[]
  sourceName: string
  sourceUrl: string
  context?: RateContext | null
}

export type DepositGroup = 'bank' | 'savings_bank'

export interface RateChange {
  kind: 'deposit' | 'saving'
  company: string
  productCode: string
  productName: string
  termMonths: number
  rateType: string
  fieldLabel: string
  before: string
  after: string
  changePoint: string
}

export interface RateAlerts {
  latestDay: string | null
  previousDay: string | null
  bank: { bankCode: string; company: string; changes: RateChange[] } | null
  watched: RateChange[]
  sourceName: string
  sourceUrl: string
}

export function getRateAlerts(payload: { bankCode?: string; watch: { kind: string; company: string; productCode: string }[] }, signal?: AbortSignal): Promise<RateAlerts> {
  return request('/api/v1/market/product-rates/alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal })
}

export function getDepositProducts(payload: { amount: number; months: 12 | 24; group: DepositGroup }, signal?: AbortSignal): Promise<DepositProductsResponse> {
  return request('/api/v1/maturity-plan/deposit-products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal })
}

export function getSavingProducts(payload: { monthlyAmount: number; months: 6 | 12 | 24 | 36; group: DepositGroup; reserve: 'all' | 'fixed' | 'free' }, signal?: AbortSignal): Promise<DepositProductsResponse> {
  return request('/api/v1/saving-products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal })
}

export interface LoanProduct {
  company: string
  productCode: string
  productName: string
  repayType: string
  rateType: string
  guarantee: string
  rateMin: string
  rateMax: string
  monthlyLabel: string
  monthlyMin: number
  monthlyMax: number
  totalInterestMin: number
  totalInterestMax: number
  loanLimit: string
  earlyRepayFee: string
  delayRate: string
  joinWay: string
  disclosedMonth: string
}

export interface LoanProductsResponse {
  principal: number
  months: number
  group: string
  day: string | null
  count: number
  products: LoanProduct[]
  notes: string[]
  sourceName: string
  sourceUrl: string
}

export function getLoanProducts(payload: {
  principal: number; months: number; group: DepositGroup; repay: 'all' | 'interest_only' | 'instalment'; rateType: 'all' | 'fixed' | 'variable'
  guarantee: 'all' | 'sgi' | 'hf' | 'hug'
}, signal?: AbortSignal): Promise<LoanProductsResponse> {
  return request('/api/v1/loan-products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal })
}

export interface YouthPolicy {
  policyNo: string
  name: string
  keywords: string[]
  summary: string
  support: string
  category: string
  ageLabel: string
  incomeNote: string
  extraConditions: string
  applyLabel: string
  applyEnd: string | null
  applyMethod: string
  selection: string
  institution: string
  applyUrl: string
  refUrl: string
  regionLabel: string
  modifiedOn: string | null
}

export interface YouthPoliciesResponse {
  day: string | null
  total: number
  count: number
  offset: number
  policies: YouthPolicy[]
  categories: string[]
  regions: { code: string; name: string }[]
  notes: string[]
  sourceName: string
  sourceUrl: string
}

export function getYouthPolicies(payload: {
  keyword: string; category: string; region: string; age: number | null; openOnly: boolean; sort: 'deadline' | 'recent'; offset: number; limit: number
}, signal?: AbortSignal): Promise<YouthPoliciesResponse> {
  return request('/api/v1/youth-policies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal })
}

export function planAfterMaturity(payload: {
  amount: number
  months: 12 | 24
  profile: RiskProfile
  mix?: { assetCode: string; depositShare: number }
}, signal?: AbortSignal): Promise<MaturityPlanResponse> {
  return request<MaturityPlanResponse>('/api/v1/maturity-plan', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal,
  })
}

export interface RateScenarioCase {
  key: 'up' | 'same' | 'down'
  ratePercent: string
  principal: number
  interest: number
  tax: number
  afterTax: number
  differenceFromSame: number
}

export function calculateRateScenario(payload: {
  monthlyAmount: number
  months: number
  ratePercent: string
  step: string
}, signal?: AbortSignal): Promise<{ monthlyAmount: number; months: number; step: string; cases: RateScenarioCase[] }> {
  return request('/api/v1/rate-scenario', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal,
  })
}

export interface AssistantChatResponse {
  answer: string
  links: { to: string; label: string }[]
  source: 'ai' | 'rule' | 'unavailable'
  // What the AI answer was based on: site pages, terms, daily news digests or market values.
  sources?: { title: string; url: string | null; publishedOn: string | null }[]
  // Questions worth asking next, chosen by the screen the answer points to.
  suggestions?: string[]
}

export interface AssistantTurn {
  role: 'user' | 'assistant'
  text: string
}

export class ApiError extends Error {
  readonly status?: number

  constructor(
    message: string,
    status?: number,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  let response: Response

  try {
    response = await fetch(`${API_BASE_URL}/api/v1/health`, { signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }
    throw new ApiError('백엔드에 연결할 수 없습니다.')
  }

  if (!response.ok) {
    throw new ApiError('서비스 상태를 확인하지 못했습니다.', response.status)
  }

  return response.json() as Promise<HealthResponse>
}

export function signUp(
  email: string,
  password: string,
  displayName: string,
  termsAccepted: boolean,
): Promise<AuthSessionResponse> {
  return request<AuthSessionResponse>('/api/v1/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, displayName, termsAccepted }),
  })
}

export function login(email: string, password: string): Promise<AuthSessionResponse> {
  return request<AuthSessionResponse>('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
}

export function getMe(accessToken: string): Promise<AuthUser> {
  return request<AuthUser>('/api/v1/auth/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

export interface ConditionStat {
  code: string
  title: string
  bonusRate: number
  shown: boolean
  responses: number | null
  yesPercent: number | null
  noPercent: number | null
  unknownPercent: number | null
}

export interface ConditionStatsResponse {
  start: string
  end: string
  minimumResponses: number
  banks: { bankCode: string; bankName: string; conditions: ConditionStat[] }[]
}

export function getConditionStats(signal?: AbortSignal): Promise<ConditionStatsResponse> {
  return request<ConditionStatsResponse>('/api/v1/analytics/condition-stats', { signal })
}

export interface SavingsEstimateResponse {
  monthlyAmount: number
  termMonths: number
  contributionType: ContributionType
  contributionRate: number
  principal: number
  banks: {
    bankCode: string
    bankName: string
    productName: string
    baseRate: number
    maximumRate: number
    maturityAtBaseRate: number
    maturityAtMaximumRate: number
    sourceUrl: string
    sourceDate: string
  }[]
  policySourceUrl: string
  policySourceDate: string
  disclaimer: string
}

// 다른 사이트에 넣는 위젯이 쓰는 공개 계산 API(로그인·저장 없음).
export function getSavingsEstimate(monthlyAmount: number, contributionType: ContributionType, signal?: AbortSignal): Promise<SavingsEstimateResponse> {
  return request<SavingsEstimateResponse>(`/api/v1/public/savings-estimate?monthlyAmount=${monthlyAmount}&contributionType=${contributionType}`, { signal })
}

export function getSavingsProducts(signal?: AbortSignal): Promise<SavingsProductsResponse> {
  return request<SavingsProductsResponse>('/api/v1/savings/products', { signal })
}

export interface MyStatusResponse {
  timeline: {
    phase: 'before_start' | 'saving' | 'matured' | 'unknown'
    startMonth: string | null
    maturityMonth: string | null
    currentRound: number | null
    termMonths: number
    monthsToMaturity: number | null
  }
  payments: {
    paidRounds: number
    paidAmount: number
    remainingRounds: number
    remainingAmount: number
    skippedRounds: number[]
    reducedRounds: number[]
  }
  cashflow: CashflowCalculationResponse
  conditions: {
    applied: ConditionResult[]
    notApplied: ConditionResult[]
    needsCheck: ConditionResult[]
    ifCheckedMaturityAmount: number | null
    ifCheckedGain: number | null
    impacts: { code: string; maturityAmount: number; loss: number }[]
  }
}

export function getMyStatus(payload: {
  bankCode: string
  monthlyAmounts: number[]
  fixedMonthlyAmount: number
  contributionType: ContributionType
  conditionAnswers: Record<string, ConditionAnswer>
  startMonth?: string
  enrolled: boolean
}, signal?: AbortSignal): Promise<MyStatusResponse> {
  return request('/api/v1/savings/my-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal })
}

export function calculateSavings(payload: {
  monthlyAmount: number
  contributionType: ContributionType
  conditionAnswers: Record<string, Record<string, ConditionAnswer>>
  bankCodes?: string[]
  currentBankCode?: string
}): Promise<SavingsCalculationResponse> {
  return request<SavingsCalculationResponse>('/api/v1/savings/calculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function calculateCashflow(payload: {
  bankCode: string
  monthlyAmounts: number[]
  fixedMonthlyAmount: number
  contributionType: ContributionType
  conditionAnswers: Record<string, ConditionAnswer>
}): Promise<CashflowCalculationResponse> {
  return request<CashflowCalculationResponse>('/api/v1/savings/calculate-cashflow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function calculateMonthImpact(payload: {
  bankCode: string
  monthlyAmounts: number[]
  fixedMonthlyAmount: number
  contributionType: ContributionType
  conditionAnswers: Record<string, ConditionAnswer>
  monthNumber: number
  reducedAmount: number
}): Promise<MonthImpactResponse> {
  return request<MonthImpactResponse>('/api/v1/savings/month-impact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function calculateEarlyExit(payload: {
  bankCode: string
  monthlyAmounts: number[]
  fixedMonthlyAmount: number
  contributionType: ContributionType
  conditionAnswers: Record<string, ConditionAnswer>
  paidMonths: number
}, signal?: AbortSignal): Promise<EarlyExitResponse> {
  return request<EarlyExitResponse>('/api/v1/savings/early-exit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  })
}

export function getDaily(signal?: AbortSignal): Promise<DailyBriefingResponse> {
  return request<DailyBriefingResponse>('/api/v1/daily', { signal })
}

export function getNewsHeadlines(
  region: 'domestic' | 'international', signal?: AbortSignal, featured = false, provider?: 'bok_press',
): Promise<NewsHeadlinesResponse> {
  return request<NewsHeadlinesResponse>(`/api/v1/daily/headlines?region=${region}&limit=${featured ? 5 : 10}${featured ? '&featured=true' : ''}${provider ? `&provider=${provider}` : ''}`, { signal })
}

export interface MarketItem {
  code: string
  name: string
  unit: string
  cycle: 'D' | 'M'
  period: string
  value: string
  previousPeriod: string | null
  change: string | null
  changePercent: string | null
  /** The latest period first arrived within the last few days. */
  isNew?: boolean
}

export interface MarketResponse {
  groups: { key: string; title: string; note: string; items: MarketItem[] }[]
  rateTrend: { period: string; baseRate: string | null; depositRate: string | null; cpiYoy?: string | null }[]
  sourceName: string
  sourceUrl: string
  updatedAt: string | null
}

export function getMarket(signal?: AbortSignal): Promise<MarketResponse> {
  return request<MarketResponse>('/api/v1/market', { signal })
}

export interface ProductRateChange {
  kind: 'deposit' | 'saving'
  group: string
  company: string
  productName: string
  termMonths: number
  rateType: string
  reserveType: string
  field: 'base_rate' | 'max_rate'
  fieldLabel: string
  before: string
  after: string
  changePoint: string
}

export interface ProductRateChanges {
  latestDay: string | null
  previousDay: string | null
  productCount: number
  changes: ProductRateChange[]
  added: number
  removed: number
  sourceName: string
  sourceUrl: string
}

export function getProductRateChanges(signal?: AbortSignal): Promise<ProductRateChanges> {
  return request<ProductRateChanges>('/api/v1/market/product-rates/changes', { signal })
}

export function getNewsDigest(signal?: AbortSignal): Promise<NewsDigest> {
  return request<NewsDigest>('/api/v1/daily/digest', { signal })
}

export function getInvestmentAssets(signal?: AbortSignal): Promise<InvestmentAssetsResponse> {
  return request<InvestmentAssetsResponse>('/api/v1/investments/assets', { signal })
}

export function calculateComparison(payload: {
  bankCode: string
  monthlyAmounts: number[]
  fixedMonthlyAmount: number
  contributionType: ContributionType
  conditionAnswers: Record<string, ConditionAnswer>
  assetCodes: string[]
}): Promise<ComparisonResponse> {
  return request<ComparisonResponse>('/api/v1/comparisons/calculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function askAssistant(message: string, history: AssistantTurn[] = [], profile?: AssistantProfile, signal?: AbortSignal): Promise<AssistantChatResponse> {
  return request<AssistantChatResponse>('/api/v1/assistant/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history, profile }),
    signal,
  })
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, options)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }
    throw new ApiError('서버에 연결할 수 없습니다.')
  }

  if (!response.ok) {
    let message = '요청을 처리하지 못했습니다.'
    try {
      const body = (await response.json()) as { error?: { message?: string } }
      if (body.error?.message) message = body.error.message
    } catch {
      // JSON 오류 본문이 아니면 기본 메시지를 사용한다.
    }
    throw new ApiError(message, response.status)
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export interface CollectionOverview {
  today: string
  productRates: { day: string | null; rows: number; stale: boolean }
  productInfos: { rows: number }
  loans: { day: string | null; rows: number; stale: boolean }
  dart: { banks: number; latestFilingDay: string | null }
  market: { code: string; name: string; period: string; fetchedAt: string | null }[]
}

export interface CollectionRun {
  id: number
  workflow: string
  status: string
  stage: string | null
  errorMessage: string | null
  published: number
  finishedAt: string
}

export interface CollectionStatus {
  latestStatus: string | null
  recent: CollectionRun[]
  todayTokens: number
  dailyTokenLimit: number
  tokenLimitExceeded: boolean
}

export interface FunnelStep { event: string; label: string; inFunnel: boolean; count: number; ofFirstStepPercent: number | null }
export interface Funnel { start: string; end: string; steps: FunnelStep[] }

const ingestHeaders = (secret: string) => ({ 'X-Very-Rich-Ingest-Secret': secret })

// Operator screens: the secret is typed by the operator, kept only in memory, and sent only as this header.
export const getCollectionOverview = (secret: string) => request<CollectionOverview>('/api/v1/internal/collection/overview', { headers: ingestHeaders(secret) })
export const getCollectionStatus = (secret: string) => request<CollectionStatus>('/api/v1/internal/daily/runs/status', { headers: ingestHeaders(secret) })
export const getFunnel = (secret: string, days: number) => request<Funnel>(`/api/v1/internal/analytics/funnel?days=${days}`, { headers: ingestHeaders(secret) })

export interface ProductOptionDetail {
  termMonths: number
  rateType: string
  reserveType: string
  disclosedMonth: string
  history: { day: string; baseRate: string | null; maxRate: string | null }[]
}

export interface ProductDetail {
  kind: 'deposit' | 'saving'
  company: string
  productCode: string
  productName: string
  group: string
  firstDay: string
  lastDay: string
  daysCollected: number
  terms: { joinWay: string; joinMember: string; joinLimit: string; specialConditions: string; maxLimit: number | null; etcNote: string; maturityInterest: string } | null
  options: ProductOptionDetail[]
  notes: string[]
  sourceName: string
  sourceUrl: string
}

export function getProductDetail(kind: 'deposit' | 'saving', company: string, code: string, signal?: AbortSignal): Promise<ProductDetail> {
  const query = new URLSearchParams({ kind, company, code })
  return request<ProductDetail>(`/api/v1/product-detail?${query.toString()}`, { signal })
}
