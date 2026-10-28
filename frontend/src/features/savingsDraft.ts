import type { ConditionAnswer, SavingsProduct } from '../api/client'
import type { VeryRichDraft } from '../storage/draftStorage'

export function answerKey(bankCode: string, conditionCode: string) {
  return `${bankCode}:${conditionCode}`
}

export function commonAnswerKey(conditionCode: string) {
  return answerKey('common', conditionCode)
}

export function answersForApi(draft: VeryRichDraft, products: SavingsProduct[]) {
  return Object.fromEntries(products.map((product) => [
    product.bankCode,
    Object.fromEntries(product.conditions.map((condition) => [
      condition.code,
      draft.conditions[answerKey(product.bankCode, condition.code)]
        ?? draft.conditions[commonAnswerKey(condition.code)]
        ?? 'unknown',
    ])),
  ])) as Record<string, Record<string, ConditionAnswer>>
}
