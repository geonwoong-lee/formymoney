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

export interface AssistantChatResponse {
  answer: string
  links: { to: string; label: string }[]
  source: 'ai' | 'rule'
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
): Promise<AuthSessionResponse> {
  return request<AuthSessionResponse>('/api/v1/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, displayName }),
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

export function getSavingsProducts(signal?: AbortSignal): Promise<SavingsProductsResponse> {
  return request<SavingsProductsResponse>('/api/v1/savings/products', { signal })
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

export function getDaily(signal?: AbortSignal): Promise<DailyBriefingResponse> {
  return request<DailyBriefingResponse>('/api/v1/daily', { signal })
}

export function getNewsHeadlines(
  region: 'domestic' | 'international', signal?: AbortSignal, featured = false,
): Promise<NewsHeadlinesResponse> {
  return request<NewsHeadlinesResponse>(`/api/v1/daily/headlines?region=${region}&limit=${featured ? 5 : 10}${featured ? '&featured=true' : ''}`, { signal })
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

export function askAssistant(message: string, signal?: AbortSignal): Promise<AssistantChatResponse> {
  return request<AssistantChatResponse>('/api/v1/assistant/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
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

  return response.json() as Promise<T>
}
