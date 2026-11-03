import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DRAFT_STORAGE_KEY, loadDraft } from '../storage/draftStorage'
import { SavedPlans } from './SavedPlans'

const respond = (body: unknown, status = 200) => status === 204
  ? new Response(null, { status })
  : new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const draft = (amount: number) => ({
  version: 1, plan: { monthlyAmount: amount, startMonth: '2026-07', currentBankCode: 'kb' },
  conditions: { 'kb:salary': 'yes' }, monthlyPayments: { 0: amount },
})

const saved = (id: number, name: string, amount: number) => ({
  id, name, createdAt: '2026-11-03T00:00:00Z', updatedAt: '2026-11-03T00:00:00Z',
  draft: { ...draft(amount), plan: { ...draft(amount).plan, transitionStatus: null, enrollmentStatus: null } },
})

function stubServer(initial: unknown[], limit = 10) {
  const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : null
    if (method === 'GET') return Promise.resolve(respond({ plans: initial, limit }))
    if (method === 'POST') return Promise.resolve(respond({ ...saved(9, body.name, body.draft.plan.monthlyAmount) }, 201))
    if (method === 'PUT') return Promise.resolve(respond(saved(Number(String(input).split('/').pop()), body.name, body.draft.plan.monthlyAmount)))
    return Promise.resolve(respond(null, 204))
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

const calls = (fetch: ReturnType<typeof stubServer>, method: string) => fetch.mock.calls.filter(([, init]) => (init?.method ?? 'GET') === method)
const renderPlans = () => render(<MemoryRouter><SavedPlans accessToken="token-a" /></MemoryRouter>)

beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft(500_000)))
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('SavedPlans', () => {
  it('saves the current input only when asked, with the login token', async () => {
    const user = userEvent.setup()
    const fetch = stubServer([])
    renderPlans()

    expect(await screen.findByText('아직 저장한 계획이 없어요.')).toBeInTheDocument()
    expect(screen.getByText(/지금 이 기기의 입력:/)).toHaveTextContent('월 500,000원 · 2026년 07월 가입 · 조건 답 1개 · 월별 납입 1개월')
    expect(calls(fetch, 'POST')).toHaveLength(0)
    expect(screen.getByRole('button', { name: '지금 입력 저장' })).toBeDisabled()

    await user.type(screen.getByLabelText('계획 이름'), '월 50만 원 국민은행')
    await user.click(screen.getByRole('button', { name: '지금 입력 저장' }))

    const [, init] = calls(fetch, 'POST')[0]
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-a')
    expect(JSON.parse(String(init?.body))).toEqual({ name: '월 50만 원 국민은행', draft: draft(500_000) })
    expect(await screen.findByText('지금 입력을 계획으로 저장했어요.')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: '저장한 계획 목록' })).getByText('월 50만 원 국민은행')).toBeInTheDocument()
  })

  it('loads a plan into this device, overwrites one, and deletes one or all after asking', async () => {
    const user = userEvent.setup()
    const fetch = stubServer([saved(1, '예전 계획', 300_000), saved(2, '다른 계획', 200_000)])
    renderPlans()
    const list = await screen.findByRole('list', { name: '저장한 계획 목록' })
    const first = within(list).getAllByRole('listitem')[0]

    await user.click(within(first).getByRole('button', { name: '불러오기' }))
    expect(loadDraft().plan).toEqual({ monthlyAmount: 300_000, startMonth: '2026-07', currentBankCode: 'kb' })  // no nulls kept
    expect(screen.getByText(/지금 이 기기의 입력:/)).toHaveTextContent('월 300,000원')
    expect(calls(fetch, 'POST')).toHaveLength(0)

    await user.click(within(first).getByRole('button', { name: '지금 입력으로 바꾸기' }))
    expect(String(calls(fetch, 'PUT')[0][0])).toMatch(/\/api\/v1\/me\/plans\/1$/)

    await user.click(within(within(screen.getByRole('list', { name: '저장한 계획 목록' })).getAllByRole('listitem')[1]).getByRole('button', { name: '지우기' }))
    expect(String(calls(fetch, 'DELETE')[0][0])).toMatch(/\/me\/plans\/2$/)
    expect(await screen.findByText("'다른 계획'을 지웠어요.")).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '저장한 계획 모두 지우기' }))
    expect(String(calls(fetch, 'DELETE')[1][0])).toMatch(/\/me\/plans$/)
    expect(await screen.findByText('아직 저장한 계획이 없어요.')).toBeInTheDocument()
  })

  it('does nothing when the user cancels, and explains an empty input or a full list', async () => {
    const user = userEvent.setup()
    vi.mocked(window.confirm).mockReturnValue(false)
    const fetch = stubServer([saved(1, '예전 계획', 300_000)], 1)
    renderPlans()
    const list = await screen.findByRole('list', { name: '저장한 계획 목록' })

    await user.click(within(list).getByRole('button', { name: '지우기' }))
    await user.click(within(list).getByRole('button', { name: '불러오기' }))
    expect(calls(fetch, 'DELETE')).toHaveLength(0)
    expect(loadDraft().plan.monthlyAmount).toBe(500_000)
    expect(screen.getByText(/1개를 모두 썼어요/)).toBeInTheDocument()

    cleanup()
    window.localStorage.clear()
    stubServer([])
    renderPlans()
    expect(await screen.findByText(/저장할 입력이 없어요/)).toBeInTheDocument()
  })
})
