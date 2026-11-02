// Input choices for the "만약 기준금리가 바뀐다면?" card. The calculation itself runs on the server
// (POST /api/v1/rate-scenario) so the site keeps one savings interest rule.
export const MONTH_OPTIONS = [6, 12, 24, 36] as const
export const STEP_OPTIONS = [0.25, 0.5, 1] as const
export const MIN_MONTHLY = 10_000
export const MAX_MONTHLY = 10_000_000
