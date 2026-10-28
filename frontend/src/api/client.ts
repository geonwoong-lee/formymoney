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
