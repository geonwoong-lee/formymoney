// Anonymous usage counts, sent only after the user agrees. Only an event name is sent: no id, no answers,
// no amounts. The server keeps a per-day count and nothing else.

export const ANALYTICS_CONSENT_KEY = 'very-rich:analytics-consent:v1'

export type AnalyticsEvent =
  | 'visit_conditions' | 'visit_banks' | 'visit_cashflow' | 'check_month_impact' | 'visit_maturity'
  | 'plan_maturity' | 'download_reminder' | 'share_result' | 'open_shared' | 'visit_my_savings' | 'visit_general_savings' | 'visit_daily' | 'visit_market' | 'visit_alternatives'

export const PAGE_EVENTS: Record<string, AnalyticsEvent> = {
  '/conditions': 'visit_conditions',
  '/banks': 'visit_banks',
  '/cashflow': 'visit_cashflow',
  '/maturity': 'visit_maturity',
  '/my-savings': 'visit_my_savings',
  '/general-savings': 'visit_general_savings',
  '/daily': 'visit_daily',
  '/market': 'visit_market',
  '/alternatives': 'visit_alternatives',
}

export type Consent = 'yes' | 'no' | null

export function readConsent(): Consent {
  try {
    const value = window.localStorage.getItem(ANALYTICS_CONSENT_KEY)
    return value === 'yes' || value === 'no' ? value : null
  } catch {
    return null
  }
}

export function writeConsent(value: 'yes' | 'no') {
  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, value)
  } catch {
    // Without storage the choice lasts only for this page; nothing is sent unless it is "yes".
  }
  window.dispatchEvent(new Event('very-rich:analytics-consent'))
}

export function track(event: AnalyticsEvent) {
  if (readConsent() !== 'yes') return
  const base = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'
  fetch(`${base}/api/v1/analytics/events`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event }), keepalive: true,
  }).catch(() => undefined)  // statistics never get in the way of the page
}
