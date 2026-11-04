import type { VeryRichDraft } from '../storage/draftStorage'
import type { WatchedProduct } from './watchlist'

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
  watch: { kind: 'deposit' | 'saving'; company: string; productCode: string }[]
}

// Same rule as the server (assistant_tools.is_about_me): it names the visitor, asks for a figure or a date, and is not a how-to.
const MARKER = /내\s*(적금|조건|납입|만기|계획|월|돈|금리|예상|정보|은행)|내가|나의|제\s*(적금|납입|조건|계획)|나는|저는|나한테|저한테|지금까지/
const RESULT = /얼마|언제|몇|계산|만기|예상|남았|받을|받게|모였|모이|금리|이자|며칠/
// Starred products and the visitor's own bank are personal questions too.
const WATCH = /관심\s*(등록|상품|있는|목록)|찜|즐겨\s*찾|별표|지켜보|내가\s*(골라|담|등록)|내\s*(거래\s*)?은행.{0,12}(금리|상품).{0,12}(바뀌|바뀐|변|올|내)/
const HOWTO = /어디(에|서)|입력해|입력하|알림|방법|어떻게\s*(받|입력|확인|보)/
const MAX_CONDITIONS = 80
const MAX_PAYMENTS = 60
const MAX_WATCH = 30

export function isAboutMe(question: string): boolean {
  if (WATCH.test(question)) return true
  return MARKER.test(question) && RESULT.test(question) && !HOWTO.test(question)
}

export function buildAssistantProfile(draft: VeryRichDraft, watched: WatchedProduct[] = []): AssistantProfile | undefined {
  const { plan } = draft
  if (!plan.currentBankCode && !plan.monthlyAmount && watched.length === 0) return undefined
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
    // Only which products to look at, never what the visitor thinks of them.
    watch: watched.slice(0, MAX_WATCH).map(({ kind, company, productCode }) => ({ kind, company, productCode })),
  }
}
