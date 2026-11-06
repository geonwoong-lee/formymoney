import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyDraft, loadDraft, saveDraft } from '../storage/draftStorage'
import { BanksPage } from './BanksPage'
import { ConditionsPage } from './ConditionsPage'

const productsResponse = {
  policy: {
    termMonths: 36,
    minimumMonthlyAmount: 1_000,
    maximumMonthlyAmount: 500_000,
    generalContributionRate: 6,
    preferredContributionRate: 12,
    taxExempt: true,
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

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('Phase 4 pages', () => {
  it('stores the full plan and can reset every browser input', async () => {
    const user = userEvent.setup()
    saveDraft({ ...emptyDraft, plan: { monthlyAmount: 300_000 }, conditions: { 'common:income_plus': 'yes' } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(productsResponse), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })))

    render(<MemoryRouter><ConditionsPage /></MemoryRouter>)

    expect(await screen.findByRole('combobox', { name: '현재 가입 상태' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '내 적금 은행(가입했거나 가입할 곳)' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '청년도약계좌 전환 여부' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '처음부터 다시 입력' }))
    expect(loadDraft()).toEqual(emptyDraft)
    expect(screen.getByRole('textbox', { name: '매달 넣을 금액' })).toHaveValue('500,000')
  })

  it('shows the difference from the selected current bank', async () => {
    saveDraft({ ...emptyDraft, plan: { monthlyAmount: 500_000, currentBankCode: 'kb' } })
    const calculationResponse = {
      monthlyAmount: 500_000, termMonths: 36, contributionType: 'general', taxExempt: true,
      results: [
        { bankCode: 'shinhan', bankName: '신한은행', productName: '신한 청년미래적금', baseRate: 5, maximumRate: 8, appliedBonusRate: 1, expectedRate: 6, principal: 18_000_000, depositInterest: 1, governmentContribution: 1, governmentContributionInterest: 1, expectedMaturityAmount: 20_000_000, differenceFromCurrentBank: 100_000, conditions: [], sourceUrl: 'https://example.com', sourceDate: '2026-10-13' },
        { bankCode: 'kb', bankName: 'KB국민은행', productName: 'KB 청년미래적금', baseRate: 5, maximumRate: 8, appliedBonusRate: 0, expectedRate: 5, principal: 18_000_000, depositInterest: 1, governmentContribution: 1, governmentContributionInterest: 1, expectedMaturityAmount: 19_900_000, differenceFromCurrentBank: 0, conditions: [], sourceUrl: 'https://example.com', sourceDate: '2026-10-13' },
      ],
    }
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const body = String(input).endsWith('/products') ? productsResponse : calculationResponse
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    }))

    render(<MemoryRouter><BanksPage /></MemoryRouter>)

    expect(await screen.findByText('내 적금 은행보다 +100,000원')).toBeInTheDocument()
    expect(screen.getByText('내 적금 은행')).toBeInTheDocument()
  })

  it('does not call a different bank the current bank when it gives the same amount', async () => {
    saveDraft({ ...emptyDraft, plan: { monthlyAmount: 500_000, currentBankCode: 'kb' } })
    const row = (bankCode: string, bankName: string) => ({ bankCode, bankName, productName: `${bankName} 청년미래적금`, baseRate: 5, maximumRate: 8, appliedBonusRate: 0, expectedRate: 5, principal: 18_000_000, depositInterest: 1, governmentContribution: 1, governmentContributionInterest: 1, expectedMaturityAmount: 19_900_000, differenceFromCurrentBank: 0, conditions: [], sourceUrl: 'https://example.com', sourceDate: '2026-10-13' })
    const calculationResponse = { monthlyAmount: 500_000, termMonths: 36, contributionType: 'general', taxExempt: true, results: [row('shinhan', '신한은행'), row('kb', 'KB국민은행')] }
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const body = String(input).endsWith('/products') ? productsResponse : calculationResponse
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    }))

    render(<MemoryRouter><BanksPage /></MemoryRouter>)

    expect(await screen.findByText('내 적금 은행과 같아요')).toBeInTheDocument()
    expect(screen.getAllByText('내 적금 은행')).toHaveLength(1)
  })

  it('lets me pick my savings bank from the comparison, saves it and recalculates', async () => {
    const user = userEvent.setup()
    saveDraft({ ...emptyDraft, plan: { monthlyAmount: 500_000 } })
    const row = (bankCode: string, bankName: string) => ({ bankCode, bankName, productName: `${bankName} 청년미래적금`, baseRate: 5, maximumRate: 8, appliedBonusRate: 0, expectedRate: 5, principal: 18_000_000, depositInterest: 1, governmentContribution: 1, governmentContributionInterest: 1, expectedMaturityAmount: 19_900_000, differenceFromCurrentBank: null, conditions: [], sourceUrl: 'https://example.com', sourceDate: '2026-10-13' })
    const calculationResponse = { monthlyAmount: 500_000, termMonths: 36, contributionType: 'general', taxExempt: true, results: [row('shinhan', '신한은행'), row('kb', 'KB국민은행')] }
    const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
      const body = String(input).endsWith('/products') ? productsResponse : calculationResponse
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter><BanksPage /></MemoryRouter>)

    const buttons = await screen.findAllByRole('button', { name: '내 적금으로 정하기' })
    expect(buttons).toHaveLength(2)
    await user.click(buttons[1])

    expect(loadDraft().plan.currentBankCode).toBe('kb')
    await vi.waitFor(() => {
      const bodies = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/calculate')).map(([, init]) => JSON.parse(String(init?.body)))
      expect(bodies.at(-1)?.currentBankCode).toBe('kb')
    })
    expect(await screen.findAllByRole('button', { name: '내 적금으로 정하기' })).toHaveLength(1)
  })

  it('guides an enrolled user to enter the bank and enrollment month', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(productsResponse), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })))

    render(<MemoryRouter><ConditionsPage /></MemoryRouter>)
    await user.selectOptions(await screen.findByRole('combobox', { name: '현재 가입 상태' }), 'enrolled')

    expect(screen.getByText('이미 가입했다면 이렇게 확인해요')).toBeInTheDocument()
    expect(screen.getByText('현재 가입한 은행을 선택해 주세요.')).toBeInTheDocument()
    expect(screen.getByText('이미 가입했다면 가입한 달을 입력해 주세요.')).toBeInTheDocument()
    const submit = screen.getByRole('button', { name: '가입 후 납입내역 계산하기' })
    expect(submit).toBeDisabled()

    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    await user.type(screen.getByLabelText('가입한 달'), currentMonth)
    await user.selectOptions(screen.getByRole('combobox', { name: '가입한 은행' }), 'kb')
    expect(submit).toBeEnabled()
  })
})
