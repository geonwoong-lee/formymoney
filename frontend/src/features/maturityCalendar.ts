// A calendar file (.ics) for the month a savings plan matures, with a reminder 30 days before.
// Built in the browser and downloaded by the user; nothing about the plan is sent or stored anywhere.

export const REMINDER_DAYS = 30

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
    `TRIGGER:-P${REMINDER_DAYS}D`,
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(`${title}까지 ${REMINDER_DAYS}일 남았어요`)}`,
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
