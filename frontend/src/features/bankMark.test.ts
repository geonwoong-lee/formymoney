import { describe, expect, it } from 'vitest'
import { bankMark } from '../features/bankMark'

describe('bankMark', () => {
  it('uses the short mark for each compared bank code', () => {
    expect([
      'kb', 'shinhan', 'nh', 'woori', 'hana', 'ibk', 'post', 'sh', 'im', 'busan', 'gwangju', 'jeonbuk', 'gyeongnam', 'kakao',
    ].map((code) => bankMark(code, 'x'))).toEqual(['KB', '신한', 'NH', '우리', '하나', 'IBK', '우체국', 'Sh', 'iM', 'BNK', '광주', '전북', 'BNK', '카카오'])
  })

  it('reads the company names 금감원 uses, so lists get the same mark as the bank pages', () => {
    expect(['국민은행', '농협은행주식회사', '주식회사 하나은행', '중소기업은행', 'Sh수협은행', '아이엠뱅크', '부산은행', '경남은행', '주식회사 카카오뱅크', '주식회사 케이뱅크', '토스뱅크 주식회사']
      .map((name) => bankMark(undefined, name))).toEqual(['KB', 'NH', '하나', 'IBK', 'Sh', 'iM', 'BNK', 'BNK', '카카오', 'K', '토스'])
  })

  it('falls back to the first two letters of the name without company words', () => {
    expect(bankMark(undefined, 'OK저축은행')).toBe('OK')
    expect(bankMark(undefined, '(주)한솔저축은행')).toBe('한솔')
    expect(bankMark(undefined, '')).toBe('?')
  })
})
