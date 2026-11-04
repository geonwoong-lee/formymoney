import { describe, expect, it } from 'vitest'
import { bankSearchTerms, companyMatches } from './bankAliases'

const matching = (query: string, companies: string[]) => companies.filter((company) => companyMatches(company, bankSearchTerms(query)))
const NAMES = ['국민은행', 'KB저축은행', '농협은행주식회사', '엔에이치저축은행', '중소기업은행', 'IBK저축은행', '아이엠뱅크', '한국스탠다드차타드은행', '우리은행', '우리금융저축은행', '부산은행', 'BNK저축은행']

describe('bank search terms', () => {
  it('finds the same company under the name people use and the name the disclosure uses', () => {
    expect(matching('KB', NAMES)).toEqual(['국민은행', 'KB저축은행'])
    expect(matching('kb', NAMES)).toEqual(['국민은행', 'KB저축은행'])
    expect(matching('국민', NAMES)).toEqual(['국민은행', 'KB저축은행'])
    expect(matching('NH', NAMES)).toEqual(['농협은행주식회사', '엔에이치저축은행'])
    expect(matching('IBK', NAMES)).toEqual(['중소기업은행', 'IBK저축은행'])
    expect(matching('SC', NAMES)).toEqual(['한국스탠다드차타드은행'])
    expect(matching('BNK', NAMES)).toEqual(['부산은행', 'BNK저축은행'])
  })

  it('treats anything else as plain text, with no alias guessing from a part of a word', () => {
    expect(matching('우리', NAMES)).toEqual(['우리은행', '우리금융저축은행'])
    expect(bankSearchTerms('우리')).toEqual(['우리'])
    expect(bankSearchTerms('국')).toEqual(['국'])  // "국" is not the alias 국민
    expect(bankSearchTerms('  ')).toEqual([])
  })
})
