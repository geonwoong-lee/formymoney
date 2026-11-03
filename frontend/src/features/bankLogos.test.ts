import { describe, expect, it } from 'vitest'
import { bankLogoUrl } from './bankLogos'

describe('bankLogoUrl', () => {
  it('has an icon for each compared bank code, shared where two banks use the same one', () => {
    const codes = ['kb', 'shinhan', 'nh', 'woori', 'hana', 'ibk', 'post', 'sh', 'im', 'busan', 'gwangju', 'jeonbuk', 'gyeongnam', 'kakao']
    for (const code of codes) expect(bankLogoUrl(code, 'x'), code).toBeTruthy()
    expect(bankLogoUrl('busan', 'x')).toBe(bankLogoUrl('gyeongnam', 'x'))
    expect(bankLogoUrl('gwangju', 'x')).toBe(bankLogoUrl('jeonbuk', 'x'))
    expect(new Set(codes.map((code) => bankLogoUrl(code, 'x'))).size).toBe(12)
  })

  it('reads the company names 금감원 uses and leaves 저축은행 and unknown banks to the pixel building', () => {
    expect(bankLogoUrl(undefined, '국민은행')).toBe(bankLogoUrl('kb', ''))
    expect(bankLogoUrl(undefined, '농협은행주식회사')).toBe(bankLogoUrl('nh', ''))
    expect(bankLogoUrl(undefined, '주식회사 카카오뱅크')).toBe(bankLogoUrl('kakao', ''))
    expect(bankLogoUrl(undefined, '신한저축은행')).toBeUndefined()
    expect(bankLogoUrl(undefined, '제주은행')).toBeUndefined()
    expect(bankLogoUrl('unknown', 'OK저축은행')).toBeUndefined()
  })
})
