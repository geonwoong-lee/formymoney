// A calendar file (.ics) for the month a savings plan matures, with reminders 90 and 30 days before.
// Built in the browser and downloaded by the user; nothing about the plan is sent or stored anywhere.

export const REMINDER_DAYS = 30
// The earlier nudge leaves time to compare where the money goes next before the plan ends.
export const EARLY_REMINDER_DAYS = 90

export function maturityMonth(startMonth: string, termMonths: number): string | null {
  const match = /^(\d{4})-(\d{2})$/.exec(startMonth)
  if (!match || !Number.isInteger(termMonths) || termMonths <= 0) return null
  const index = Number(match[1]) * 12 + Number(match[2]) - 1 + termMonths
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

function escapeText(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll(';', '\\;').replaceAll(',', '\\,').replaceAll('\n', '\\n')
}

function stamp(now: Date) {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

export function buildMaturityIcs(
  plan: { startMonth: string; termMonths: number; bankName: string; productName: string },
  now: Date = new Date(),
): string | null {
  const month = maturityMonth(plan.startMonth, plan.termMonths)
  if (!month) return null
  const [year, monthNumber] = month.split('-')
  const nextDay = `${year}${monthNumber}02`
  const title = `${plan.bankName} ${plan.productName} 만기 달`
  const description = '적금이 끝나는 달이에요. 정확한 만기일과 받을 금액은 가입한 은행에서 확인해 주세요. 목돈을 어디에 둘지는 Very Rich? 만기 후 계획에서 비교해 볼 수 있어요.'
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Very Rich?//Maturity reminder//KO',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:maturity-${plan.startMonth}-${plan.termMonths}@very-rich`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART;VALUE=DATE:${year}${monthNumber}01`,
    `DTEND;VALUE=DATE:${nextDay}`,
    `SUMMARY:${escapeText(title)}`,
    `DESCRIPTION:${escapeText(description)}`,
    'BEGIN:VALARM',
    `TRIGGER:-P${EARLY_REMINDER_DAYS}D`,
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(`${title}까지 ${EARLY_REMINDER_DAYS}일 남았어요. 만기금액을 어디에 둘지 만기 후 계획에서 비교해 보세요`)}`,
    'END:VALARM',
    'BEGIN:VALARM',
    `TRIGGER:-P${REMINDER_DAYS}D`,
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(`${title}까지 ${REMINDER_DAYS}일 남았어요`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n')
}

export const CHECK_DAY = 25

/**
 * A repeating all-day event on the 25th of every month still left to pay in, as a nudge to tick off the bonus-rate
 * conditions. Returns null when no payment month is left. Built in the browser; nothing is sent anywhere.
 */
export function buildMonthlyCheckIcs(
  plan: { startMonth: string; termMonths: number; bankName: string; productName: string },
  now: Date = new Date(),
): string | null {
  const match = /^(\d{4})-(\d{2})$/.exec(plan.startMonth)
  if (!match || !Number.isInteger(plan.termMonths) || plan.termMonths <= 0) return null
  const startIndex = Number(match[1]) * 12 + Number(match[2]) - 1
  const lastPayment = startIndex + plan.termMonths - 1
  const nowIndex = now.getFullYear() * 12 + now.getMonth() + (now.getDate() > CHECK_DAY ? 1 : 0)
  const first = Math.max(startIndex, nowIndex)
  const count = lastPayment - first + 1
  if (count <= 0) return null
  const day = (index: number, dayOfMonth: number) => `${Math.floor(index / 12)}${String((index % 12) + 1).padStart(2, '0')}${String(dayOfMonth).padStart(2, '0')}`
  const title = `${plan.bankName} 우대조건 확인`
  const description = '이번 달 우대조건(급여 이체, 카드 실적 등)을 채웠는지 확인해 보세요. Very Rich? 내 적금에서 체크하고 놓치면 만기금액이 얼마나 줄어드는지 볼 수 있어요.'
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Very Rich?//Condition check reminder//KO',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:condition-check-${plan.startMonth}-${plan.termMonths}@very-rich`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART;VALUE=DATE:${day(first, CHECK_DAY)}`,
    `DTEND;VALUE=DATE:${day(first, CHECK_DAY + 1)}`,
    `RRULE:FREQ=MONTHLY;COUNT=${count}`,
    `SUMMARY:${escapeText(title)}`,
    `DESCRIPTION:${escapeText(description)}`,
    'BEGIN:VALARM',
    'TRIGGER:PT9H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n')
}

export function downloadIcs(content: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}
