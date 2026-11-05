import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BankDetailPage } from './BankDetailPage'

const products = {
  policy: { termMonths: 36, minimumMonthlyAmount: 1_000, maximumMonthlyAmount: 500_000, generalContributionRate: 6, preferredContributionRate: 12, taxExempt: true },
  products: [{ bankCode: 'kb', bankName: 'KB국민은행', productName: 'KB 청년미래적금', baseRate: 5, maximumRate: 8, sourceUrl: 'https://example.com', sourceDate: '2026-10-13', conditions: [] }],
}
const calculation = {
  monthlyAmount: 500_000, termMonths: 36, contributionType: 'general', taxExempt: true,
  results: [{
    bankCode: 'kb', bankName: 'KB국민은행', productName: 'KB 청년미래적금', baseRate: 5, maximumRate: 8, appliedBonusRate: 0, expectedRate: 5,
    principal: 18_000_000, depositInterest: 1_387_500, governmentContribution: 1_080_000, governmentContributionInterest: 83_250,
    expectedMaturityAmount: 20_550_750, differenceFromCurrentBank: null, sourceUrl: 'https://example.com', sourceDate: '2026-10-13',
    conditions: [
      { code: 'salary', title: '급여이체', answer: 'unknown', status: 'needs_review', bonusRate: 1, appliedBonusRate: 0, reason: '확인이 필요해요.' },
      { code: 'card', title: '카드 실적', answer: 'unknown', status: 'needs_review', bonusRate: 0.5, appliedBonusRate: 0, reason: '확인이 필요해요.' },
    ],
  }],
}
const stats = {
  start: '2026-08-08', end: '2026-11-05', minimumResponses: 20,
  banks: [{ bankCode: 'kb', bankName: 'KB국민은행', conditions: [
    { code: 'salary', title: '급여이체', bonusRate: 1, shown: true, responses: 40, yesPercent: 63, noPercent: 25, unknownPercent: 13 },
    { code: 'card', title: '카드 실적', bonusRate: 0.5, shown: false, responses: null, yesPercent: null, noPercent: null, unknownPercent: null },
  ] }],
}

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

function stubFetch(statsOk: boolean) {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/savings/products')) return json(products)
    if (url.endsWith('/savings/calculate')) return json(calculation)
    if (url.endsWith('/analytics/condition-stats')) return statsOk ? json(stats) : json({ detail: '집계를 불러오지 못했습니다.' }, 503)
    return json({ detail: '없음' }, 404)
  }))
}

function renderPage() {
  render(<MemoryRouter initialEntries={['/banks/kb']}><Routes><Route path="/banks/:bankId" element={<BankDetailPage />} /></Routes></MemoryRouter>)
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('BankDetailPage condition answers from other visitors', () => {
  it('shows the share under each condition and says when there are too few answers', async () => {
    stubFetch(true)
    renderPage()

    expect(await screen.findByText('다른 방문자 응답 40건 중 63%가 채울 수 있다고 답했어요(모름 13%)')).toBeInTheDocument()
    expect(screen.getByText('다른 방문자 응답: 아직 적어서 보여 주지 않아요')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '우대조건 현황 전체 보기' })).toHaveAttribute('href', '/condition-stats')
  })

  it('keeps the calculation when the statistics cannot be loaded', async () => {
    stubFetch(false)
    renderPage()

    expect(await screen.findByText('급여이체')).toBeInTheDocument()
    expect(screen.getByText(/예상금리 5%/)).toBeInTheDocument()
    expect(screen.queryByText(/다른 방문자 응답/)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
