import { describe, expect, it } from 'vitest'
import { buildMaturityIcs, maturityMonth } from './maturityCalendar'

describe('maturity calendar', () => {
  it('finds the month after the last payment', () => {
    expect(maturityMonth('2026-07', 36)).toBe('2029-07')
    expect(maturityMonth('2026-12', 1)).toBe('2027-01')
    expect(maturityMonth('2026-7', 36)).toBeNull()
    expect(maturityMonth('2026-07', 0)).toBeNull()
  })

  it('builds an all-day event with a 30-day reminder and escaped text', () => {
    const ics = buildMaturityIcs({ startMonth: '2026-07', termMonths: 36, bankName: 'KB국민은행', productName: '청년미래적금; 특판, A' }, new Date('2026-11-02T08:00:00Z'))

    expect(ics).not.toBeNull()
    const lines = (ics ?? '').split('\r\n')
    expect(lines[0]).toBe('BEGIN:VCALENDAR')
    expect(lines).toContain('DTSTART;VALUE=DATE:20290701')
    expect(lines).toContain('DTEND;VALUE=DATE:20290702')
    expect(lines).toContain('DTSTAMP:20261102T080000Z')
    expect(lines).toContain('TRIGGER:-P30D')
    expect(lines).toContain(String.raw`SUMMARY:KB국민은행 청년미래적금\; 특판\, A 만기 달`)
    expect(ics?.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(buildMaturityIcs({ startMonth: 'bad', termMonths: 36, bankName: 'a', productName: 'b' })).toBeNull()
  })
})
