import { describe, expect, it } from 'vitest'
import { defaultPaidMonths, gainLabel } from './earlyExit'

describe('gainLabel', () => {
  it('shows the gain over the money paid in won and percent', () => {
    expect(gainLabel(6_000_000, 6_137_475)).toBe('+137,475원(+2.3%)')
    expect(gainLabel(6_000_000, 7_366_500)).toBe('+1,366,500원(+22.8%)')
  })

  it('shows a loss with a minus sign and handles no principal', () => {
    expect(gainLabel(1_000_000, 990_000)).toBe('-10,000원(-1.0%)')
    expect(gainLabel(0, 0)).toBe('0원')
  })
})

describe('defaultPaidMonths', () => {
  it('counts rounds from the start month and stays inside the term', () => {
    expect(defaultPaidMonths('2026-01', true, 36, new Date(2026, 10, 6))).toBe(11)
    expect(defaultPaidMonths(undefined, false, 36)).toBe(12)
    expect(defaultPaidMonths('2020-01', true, 36, new Date(2026, 10, 6))).toBe(35)
  })
})
