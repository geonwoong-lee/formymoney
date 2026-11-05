import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { YouthPoliciesPage } from './YouthPoliciesPage'

const policy = (name: string, extra: Record<string, unknown> = {}) => ({
  policyNo: name, name, keywords: ['월세'], summary: '월세를 지원해요.', support: '월 20만원', category: '주거', ageLabel: '만 19~34세',
  incomeNote: '중위소득 60% 이하', extraConditions: '', applyLabel: '2026.11.01 ~ 2026.11.30', applyEnd: '2026-11-30', applyMethod: '온라인',
  selection: '', institution: '국토교통부', applyUrl: 'https://apply.example.kr/1', refUrl: 'javascript:alert(1)', regionLabel: '전국', modifiedOn: '2026-11-03', ...extra,
})
const body = (policies = [policy('청년 월세 지원')], extra: Record<string, unknown> = {}) => ({
  day: '2026-11-04', total: 3865, count: policies.length, offset: 0, policies, categories: ['일자리', '주거'],
  regions: [{ code: '11', name: '서울' }, { code: '12', name: '광주·전남' }], notes: ['신청 전에 공고에서 다시 확인해 주세요.'],
  sourceName: '온통청년 청년정책 Open API (한국고용정보원)', sourceUrl: 'https://www.youthcenter.go.kr/', ...extra,
})
const json = (value: unknown) => Promise.resolve(new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } }))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('YouthPoliciesPage', () => {
  it('lists policies with age, region, period and only real web links', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(body())))
    render(<MemoryRouter><YouthPoliciesPage /></MemoryRouter>)

    expect(await screen.findByText('청년 월세 지원')).toBeInTheDocument()
    expect(screen.getByText('만 19~34세')).toBeInTheDocument()
    expect(screen.getByText('2026.11.01 ~ 2026.11.30')).toBeInTheDocument()
    expect(screen.getByText(/전체 3,865개 중 1개를 찾았어요/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /신청·공고/ })).toHaveAttribute('href', 'https://apply.example.kr/1')
    expect(screen.queryByRole('link', { name: /참고/ })).not.toBeInTheDocument()  // javascript: is never a link
    expect(screen.getByRole('option', { name: '광주·전남' })).toBeInTheDocument()
  })

  it('sends the typed filters to the server and never stores the age', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(() => json(body()))
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter><YouthPoliciesPage /></MemoryRouter>)
    await screen.findByText('청년 월세 지원')

    await user.type(screen.getByLabelText('검색어'), '월세')
    await user.type(screen.getByLabelText('내 나이(만, 선택)'), '27')
    await user.selectOptions(screen.getByLabelText('지역'), '서울')
    await user.click(screen.getByLabelText('신청 기간이 끝난 정책은 빼기'))
    await waitFor(() => {
      const last = JSON.parse((fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit])[1].body as string)
      expect(last).toMatchObject({ keyword: '월세', age: 27, region: '11', openOnly: false, sort: 'deadline', offset: 0 })
    })
    expect(window.localStorage.length).toBe(0)
  })

  it('offers a retry button when the policies cannot be loaded, and lists them once it works', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockImplementation(() => json(body([policy('청년 월세 지원')])))
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter><YouthPoliciesPage /></MemoryRouter>)

    await user.click(await screen.findByRole('button', { name: '다시 시도' }))

    expect((await screen.findAllByText('청년 월세 지원')).length).toBeGreaterThan(0)
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument()
  })

  it('says so when nothing was collected, nothing matches, or the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(body([], { total: 0, count: 0 }))))
    const first = render(<MemoryRouter><YouthPoliciesPage /></MemoryRouter>)
    expect(await screen.findByText(/아직 수집된 청년정책이 없어요/)).toBeInTheDocument()
    first.unmount()

    vi.stubGlobal('fetch', vi.fn(() => json(body([], { count: 0 }))))
    const second = render(<MemoryRouter><YouthPoliciesPage /></MemoryRouter>)
    expect(await screen.findByText(/고른 조건에 맞는 정책이 없어요/)).toBeInTheDocument()
    second.unmount()

    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}', { status: 503 }))))
    render(<MemoryRouter><YouthPoliciesPage /></MemoryRouter>)
    expect(await screen.findByText(/청년정책을 불러오지 못했어요/)).toBeInTheDocument()
  })

  it('does not call the server for an impossible age', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(() => json(body()))
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter><YouthPoliciesPage /></MemoryRouter>)
    await screen.findByText('청년 월세 지원')
    const calls = fetchMock.mock.calls.length

    await user.type(screen.getByLabelText('내 나이(만, 선택)'), '999')
    expect(await screen.findByRole('alert')).toHaveTextContent('나이는 0~120')
    expect(fetchMock.mock.calls.length).toBe(calls)
  })
})
