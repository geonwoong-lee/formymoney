import { describe, expect, it } from 'vitest'
import { parseKoreanWon } from './krw'

describe('parseKoreanWon', () => {
  it('reads amounts the way people write them in Korean', () => {
    expect(parseKoreanWon('30만원')).toBe(300_000)
    expect(parseKoreanWon('30만')).toBe(300_000)
    expect(parseKoreanWon('1.5억')).toBe(150_000_000)
    expect(parseKoreanWon('3천만원')).toBe(30_000_000)
    expect(parseKoreanWon('1억 5천만원')).toBe(150_000_000)
    expect(parseKoreanWon('1억5천')).toBe(150_000_000)  // spoken: 1억 5천(만)
    expect(parseKoreanWon('300만 5천')).toBe(3_005_000)
    expect(parseKoreanWon('５０만원')).toBe(500_000)  // full-width digits
    expect(parseKoreanWon('1,200만원')).toBe(12_000_000)
  })

  it('says nothing for text that is not an amount', () => {
    for (const text of ['', '만', '만원', 'abc', '30만abc', '1e6', '--', '3 4 억 x']) expect(parseKoreanWon(text), text).toBeNull()
  })
})
