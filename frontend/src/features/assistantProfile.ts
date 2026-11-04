import type { VeryRichDraft } from '../storage/draftStorage'

// What 머니독 may see of the visitor's own plan. It is sent only with a question that is about the visitor
// ("내 적금 만기금액이 얼마야?"), is read for that one answer on the server, and is never stored there.
export interface AssistantProfile {
  bankCode?: string
  monthlyAmount?: number
  contributionType?: 'none' | 'general' | 'preferred'
  startMonth?: string
  enrollmentStatus?: 'considering' | 'enrolled'
  conditions: Record<string, 'yes' | 'no' | 'unknown'>
  payments: Record<string, number>
}

// Same rule as the server (assistant_tools.is_about_me): it names the visitor, asks for a figure or a date, and is not a how-to.
const MARKER = /내\s*(적금|조건|납입|만기|계획|월|돈|금리|예상|정보|은행)|내가|나의|제\s*(적금|납입|조건|계획)|나는|저는|나한테|저한테|지금까지/
const RESULT = /얼마|언제|몇|계산|만기|예상|남았|받을|받게|모였|모이|금리|이자|며칠/
const HOWTO = /어디(에|서)|입력해|입력하|알림|방법|어떻게\s*(받|입력|확인|보)/
const MAX_CONDITIONS = 80
const MAX_PAYMENTS = 60

export function isAboutMe(question: string): boolean {
  return MARKER.test(question) && RESULT.test(question) && !HOWTO.test(question)
}

export function buildAssistantProfile(draft: VeryRichDraft): AssistantProfile | undefined {
  const { plan } = draft
  if (!plan.currentBankCode && !plan.monthlyAmount) return undefined
  const bank = plan.currentBankCode
  const conditions = Object.entries(draft.conditions)
    .filter(([key]) => key.startsWith('common:') || (bank !== undefined && key.startsWith(`${bank}:`)))
    .slice(0, MAX_CONDITIONS)
  const payments = Object.entries(draft.monthlyPayments)
    .filter(([key, amount]) => /^\d{1,2}$/.test(key) && Number.isInteger(amount) && amount >= 0 && amount <= 5_000_000)
    .slice(0, MAX_PAYMENTS)
  return {
    bankCode: bank,
    monthlyAmount: plan.monthlyAmount,
    contributionType: plan.contributionType,
    startMonth: plan.startMonth && /^\d{4}-\d{2}$/.test(plan.startMonth) ? plan.startMonth : undefined,
    enrollmentStatus: plan.enrollmentStatus,
    conditions: Object.fromEntries(conditions),
    payments: Object.fromEntries(payments),
  }
}
