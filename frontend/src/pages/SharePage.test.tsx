import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { decodeSharedPlan, encodeSharedPlan, sharedPlanFromDraft, shareUrl } from '../features/share'
import { emptyDraft, loadDraft, saveDraft } from '../storage/draftStorage'
import { SharePage } from './SharePage'

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const products = { products: [{ bankCode: 'kb', bankName: 'KB국민은행', conditions: [{ code: 'salary_transfer' }, { code: 'first_customer' }] }] }
const calculation = {
  monthlyAmount: 300_000, termMonths: 36, contributionType: 'preferred',
  results: [{
    bankCode: 'kb', bankName: 'KB국민은행', productName: 'KB 청년미래적금', baseRate: 4.5, maximumRate: 6, appliedBonusRate: 0.5, expectedRate: 5,
    principal: 10_800_000, depositInterest: 900_000, governmentContribution: 1_296_000, governmentContributionInterest: 0,
    expectedMaturityAmount: 12_996_000, differenceFromCurrentBank: null, conditions: [], sourceUrl: 'https://x', sourceDate: '2026-10-01',
  }],
}

const plan = { monthlyAmount: 300_000, contributionType: 'preferred' as const, currentBankCode: 'kb', conditions: { 'kb:salary_transfer': 'yes' as const, 'common:first_customer': 'no' as const } }

function stub() {
  const fetch = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => Promise.resolve(respond(String(input).includes('/products') ? products : calculation)))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

const renderAt = (url: string) => render(<MemoryRouter initialEntries={[url]}>
  <Routes><Route path="/share" element={<SharePage />} /><Route path="/banks" element={<p>은행 비교 화면</p>} /></Routes>
</MemoryRouter>)

beforeEach(() => window.localStorage.clear())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('shared plan links', () => {
  it('carry only the inputs, round-trip, and leave out "모름" answers and the cash-flow plan', () => {
    const draft = { ...emptyDraft, plan: { monthlyAmount: 300_000, contributionType: 'preferred' as const, currentBankCode: 'kb', startMonth: '2026-01' },
      conditions: { ...plan.conditions, 'kb:other': 'unknown' as const }, monthlyPayments: { '2026-02': 100_000 } }
    const shared = sharedPlanFromDraft(draft)
    expect(shared).toEqual(plan)
    expect(decodeSharedPlan(encodeSharedPlan(shared))).toEqual(plan)
    expect(shareUrl(shared, 'https://example.app')).toMatch(/^https:\/\/example\.app\/share\?d=[A-Za-z0-9_-]+$/)
    expect(atob(encodeSharedPlan(shared).replace(/-/g, '+').replace(/_/g, '/'))).not.toContain('2026-01')
  })

  it('refuse broken or edited links', () => {
    const edit = (data: Record<string, unknown>) => btoa(JSON.stringify({ v: 1, m: 300_000, c: 'general', b: '', a: '', ...data })).replace(/=+$/, '')
    expect(decodeSharedPlan(edit({}))).toEqual({ monthlyAmount: 300_000, contributionType: 'general', conditions: {} })
    expect(decodeSharedPlan('not-base64!')).toBeNull()
    expect(decodeSharedPlan(edit({ m: 9_000_000 }))).toBeNull()
    expect(decodeSharedPlan(edit({ c: 'gold' }))).toBeNull()
    expect(decodeSharedPlan(edit({ a: 'kb:x=2' }))).toBeNull()
    expect(decodeSharedPlan(edit({ a: '<script>:x=1' }))).toBeNull()
    expect(decodeSharedPlan(edit({ b: '../me' }))).toBeNull()
    expect(decodeSharedPlan(null)).toBeNull()
  })
})

describe('SharePage', () => {
  it('recalculates the shared inputs and copies them into my calculation only when asked', async () => {
    const user = userEvent.setup()
    const fetch = stub()
    renderAt(`/share?d=${encodeSharedPlan(plan)}`)

    expect(await screen.findByText('12,996,000원')).toBeInTheDocument()
    expect(screen.getByText('월 300,000원')).toBeInTheDocument()
    expect(screen.getByText('우대형 12%')).toBeInTheDocument()
    const sent = JSON.parse(String(fetch.mock.calls.find(([input]) => String(input).includes('/calculate'))?.[1]?.body))
    expect(sent).toEqual({ monthlyAmount: 300_000, contributionType: 'preferred', currentBankCode: 'kb',
      conditionAnswers: { kb: { salary_transfer: 'yes', first_customer: 'no' } } })
    expect(loadDraft()).toEqual(emptyDraft)  // opening a link changes nothing on this device

    await user.click(screen.getByRole('button', { name: '이 조건으로 내 계산 시작' }))
    expect(await screen.findByText('은행 비교 화면')).toBeInTheDocument()
    expect(loadDraft().plan).toMatchObject({ monthlyAmount: 300_000, contributionType: 'preferred', currentBankCode: 'kb' })
  })

  it('asks before replacing inputs I already have, and keeps them if I say no', async () => {
    const user = userEvent.setup()
    stub()
    saveDraft({ ...emptyDraft, plan: { monthlyAmount: 100_000 } })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderAt(`/share?d=${encodeSharedPlan(plan)}`)
    await screen.findByText('12,996,000원')

    await user.click(screen.getByRole('button', { name: '이 조건으로 내 계산 시작' }))
    expect(confirm).toHaveBeenCalled()
    expect(loadDraft().plan.monthlyAmount).toBe(100_000)
  })

  it('explains a broken link without calling the server', () => {
    const fetch = stub()
    renderAt('/share?d=broken')
    expect(screen.getByRole('heading', { name: '공유 링크를 열 수 없어요' })).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('ShareResult', () => {
  it('copies a link with my inputs when the system share sheet is not there', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } })
    saveDraft({ ...emptyDraft, plan: { monthlyAmount: 300_000, contributionType: 'preferred', currentBankCode: 'kb' }, conditions: plan.conditions })
    const { ShareResult } = await import('../components/ShareResult')
    render(<MemoryRouter><ShareResult result={calculation as never} /></MemoryRouter>)

    await user.click(screen.getByRole('button', { name: '링크로 공유' }))
    const url = (writeText.mock.calls[0] as unknown as [string])[0]
    expect(decodeSharedPlan(new URL(url).searchParams.get('d'))).toEqual(plan)
    expect(screen.getByRole('status')).toHaveTextContent('링크를 복사했어요')
  })
})
