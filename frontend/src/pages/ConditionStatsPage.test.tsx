import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConditionStatsPage } from './ConditionStatsPage'

const stats = {
  start: '2026-08-08', end: '2026-11-05', minimumResponses: 20,
  banks: [{
    bankCode: 'kb', bankName: 'KB국민은행', conditions: [
      { code: 'salary', title: '급여이체', bonusRate: 1, shown: true, responses: 40, yesPercent: 62.5, noPercent: 25, unknownPercent: 12.5 },
      { code: 'card', title: '카드 실적', bonusRate: 0.5, shown: false, responses: null, yesPercent: null, noPercent: null, unknownPercent: null },
    ],
  }],
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ConditionStatsPage', () => {
  it('shows the shares for conditions with enough answers and hides the rest', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(stats), { status: 200, headers: { 'Content-Type': 'application/json' } }))))
    render(<MemoryRouter><ConditionStatsPage /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: 'KB국민은행' })).toBeInTheDocument()
    expect(screen.getByText('62.5%')).toBeInTheDocument()
    expect(screen.getByText('40건')).toBeInTheDocument()
    expect(screen.getByText('응답이 적어 숨김')).toBeInTheDocument()
    expect(screen.getByText(/사람 수가 아니라 응답 수/)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/추천/)
  })

  it('offers a retry when the stats cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ detail: '집계를 불러오지 못했습니다.' }), { status: 503, headers: { 'Content-Type': 'application/json' } }))))
    render(<MemoryRouter><ConditionStatsPage /></MemoryRouter>)

    expect(await screen.findByRole('button', { name: '다시 시도' })).toBeInTheDocument()
  })
})

describe('ConditionStatsPage hidden cells', () => {
  it('shows a hidden answer as hidden instead of an empty percentage', async () => {
    const partly = { ...stats, banks: [{ ...stats.banks[0], conditions: [
      { code: 'salary', title: '급여이체', bonusRate: 1, shown: true, responses: 20, yesPercent: 95, noPercent: null, unknownPercent: null },
    ] }] }
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(partly), { status: 200, headers: { 'Content-Type': 'application/json' } }))))
    render(<MemoryRouter><ConditionStatsPage /></MemoryRouter>)

    expect(await screen.findByText('95%')).toBeInTheDocument()
    expect(screen.getAllByText('적어서 숨김')).toHaveLength(2)
    expect(document.body.textContent).not.toMatch(/null%/)
  })
})
