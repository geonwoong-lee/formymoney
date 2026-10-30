import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyDraft, loadDraft, saveDraft } from '../storage/draftStorage'
import { BanksPage } from './BanksPage'
import { ConditionsPage } from './ConditionsPage'

const productsResponse = {
  policy: {
    termMonths: 36, minimumMonthlyAmount: 1_000, maximumMonthlyAmount: 500_000,
    generalContributionRate: 6, preferredContributionRate: 12, taxExempt: true,
  },
  products: [{
    bankCode: 'kb', bankName: 'KB국민은행', productName: 'KB 청년미래적금',
    baseRate: 5, maximumRate: 8, sourceUrl: 'https://example.com', sourceDate: '2026-10-13',
    conditions: [{
      code: 'income_plus', title: '소득 우대', bonusRate: 0.5,
      description: '소득 기준을 확인합니다.', question: '소득 기준을 충족하나요?', requiresAdditionalReview: false,
    }],
  }],
}

const serverError = () => new Response(
  JSON.stringify({ error: { code: 'internal_error', message: '서버에서 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.' } }),
  { status: 500, headers: { 'Content-Type': 'application/json' } },
)
const ok = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200, headers: { 'Content-Type': 'application/json' },
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('failure handling', () => {
  it('keeps typed answers when loading fails and recovers on retry', async () => {
    const user = userEvent.setup()
    saveDraft({ ...emptyDraft, plan: { monthlyAmount: 300_000 }, conditions: { 'common:income_plus': 'yes' } })
    const fetchMock = vi.fn().mockResolvedValueOnce(serverError()).mockResolvedValue(ok(productsResponse))
    vi.stubGlobal('fetch', fetchMock)

    render(<MemoryRouter><ConditionsPage /></MemoryRouter>)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('서버에서 문제가 발생했습니다.')
    expect(alert).toHaveTextContent('입력한 답변은 이 브라우저에 그대로 남아 있습니다.')
    expect(screen.getByRole('spinbutton', { name: '매달 넣을 금액' })).toHaveValue(300_000)
    expect(loadDraft().conditions['common:income_plus']).toBe('yes')

    await user.click(screen.getByRole('button', { name: '다시 시도' }))

    expect(await screen.findByText('모든 은행에 공통인 질문')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: '매달 넣을 금액' })).toHaveValue(300_000)
  })

  it('shows a calculation failure as an error, never as a result, and can retry', async () => {
    const user = userEvent.setup()
    saveDraft({ ...emptyDraft, plan: { monthlyAmount: 500_000 } })
    const calculation = {
      monthlyAmount: 500_000, termMonths: 36, contributionType: 'general', taxExempt: true,
      results: [{
        bankCode: 'kb', bankName: 'KB국민은행', productName: 'KB 청년미래적금', baseRate: 5, maximumRate: 8,
        appliedBonusRate: 0, expectedRate: 5, principal: 18_000_000, depositInterest: 1,
        governmentContribution: 1, governmentContributionInterest: 1, expectedMaturityAmount: 19_900_000,
        differenceFromCurrentBank: null, conditions: [], sourceUrl: 'https://example.com', sourceDate: '2026-10-13',
      }],
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok(productsResponse)).mockResolvedValueOnce(serverError())
      .mockResolvedValueOnce(ok(productsResponse)).mockResolvedValueOnce(ok(calculation))
    vi.stubGlobal('fetch', fetchMock)

    render(<MemoryRouter><BanksPage /></MemoryRouter>)

    expect(await screen.findByRole('alert')).toHaveTextContent('서버에서 문제가 발생했습니다.')
    expect(screen.queryByText(/19,900,000원/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '다시 시도' }))

    expect(await screen.findByText(/19,900,000원/)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText(/공시 확인일 2026-10-13/)).toHaveTextContent('세금')
  })

  it('tells the user when the server cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network failed')))

    render(<MemoryRouter><ConditionsPage /></MemoryRouter>)

    expect(await screen.findByRole('alert')).toHaveTextContent('서버에 연결할 수 없습니다.')
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
  })
})
