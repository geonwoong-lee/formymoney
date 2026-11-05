// Anonymous counts of preferential condition answers, sent only after the user agreed to statistics.
// Only answers the visitor actually gave are sent (an unanswered condition is not counted as "모름"),
// at most once a day from this browser, with no id, amount or other answer attached.
import type { SavingsProduct } from '../api/client'
import type { VeryRichDraft } from '../storage/draftStorage'
import { readConsent } from './analytics'
import { answerKey, commonAnswerKey } from './savingsDraft'

export const CONDITION_ANSWERS_SENT_KEY = 'very-rich:condition-answers-sent:v1'

export function explicitAnswers(draft: VeryRichDraft, products: SavingsProduct[]) {
  const answers: Record<string, Record<string, 'yes' | 'no' | 'unknown'>> = {}
  for (const product of products) {
    for (const condition of product.conditions) {
      const answer = draft.conditions[answerKey(product.bankCode, condition.code)] ?? draft.conditions[commonAnswerKey(condition.code)]
      if (answer === undefined) continue
      answers[product.bankCode] = { ...answers[product.bankCode], [condition.code]: answer }
    }
  }
  return answers
}

function localDay(today: Date) {
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

export function sendConditionAnswers(draft: VeryRichDraft, products: SavingsProduct[], today = new Date()) {
  if (readConsent() !== 'yes') return
  const answers = explicitAnswers(draft, products)
  if (Object.keys(answers).length === 0) return
  const day = localDay(today)
  try {
    if (window.localStorage.getItem(CONDITION_ANSWERS_SENT_KEY) === day) return
    window.localStorage.setItem(CONDITION_ANSWERS_SENT_KEY, day)
  } catch {
    return  // without storage the once-a-day rule cannot be kept, so nothing is sent
  }
  const base = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'
  fetch(`${base}/api/v1/analytics/condition-answers`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers }), keepalive: true,
  }).catch(() => undefined)  // statistics never get in the way of the page
}
