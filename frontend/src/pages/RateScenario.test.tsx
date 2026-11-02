import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RateScenario } from './RateScenario'

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// The numbers the server returns for 500,000원 × 12개월 at 3% ± 0.25%p (checked in backend/tests/test_maturity.py).
const serverCases = {
  monthlyAmount: 500_000, months: 12, step: '0.25', cases: [
    { key: 'up', ratePercent: '3.25', principal: 6_000_000, interest: 105_625, tax: 16_266, afterTax: 6_089_359, differenceFromSame: 6_874 },
    { key: 'same', ratePercent: '3', principal: 6_000_000, interest: 97_500, tax: 15_015, afterTax: 6_082_485, differenceFromSame: 0 },
    { key: 'down', ratePercent: '2.75', principal: 6_000_000, interest: 89_375, tax: 13_763, afterTax: 6_075_612, differenceFromSame: -6_873 },
  ],
}

function stubServer(response: () => Response = () => respond(serverCases)) {
  const fetch = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => Promise.resolve(response()))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

const lastBody = (fetch: ReturnType<typeof stubServer>) => JSON.parse(String(fetch.mock.calls.at(-1)?.[1]?.body))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('RateScenario', () => {
  it('asks the server and shows the three cases side by side with their differences', async () => {
    const fetch = stubServer()
    render(<RateScenario defaultRate={3} />)

    const list = await screen.findByRole('list', { name: '세 가지 경우의 만기 금액' })
    expect(String(fetch.mock.calls[0][0])).toContain('/api/v1/rate-scenario')
    expect(lastBody(fetch)).toEqual({ monthlyAmount: 500_000, months: 12, ratePercent: '3', step: '0.25' })
    const cases = within(list).getAllByRole('listitem')
    expect(cases.map((item) => item.querySelector('b')?.textContent)).toEqual([
      '기준금리가 0.25%p 오르면', '기준금리가 그대로면', '기준금리가 0.25%p 내리면',
    ])
    expect(cases[0]).toHaveTextContent('적금 금리 3.25%6,089,359원')
    expect(cases[0]).toHaveTextContent('그대로일 때보다 +6,874원')
    expect(cases[2]).toHaveTextContent('그대로일 때보다 −6,873원')
    expect(screen.getByText(/은행 예금 평균금리\(신규\) 3%로 채워 두었어요/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '만약 기준금리가 바뀐다면?' })).toHaveTextContent('어느 경우가 될지 예측하지 않아요')
  })

  it('sends the new inputs, and explains bad input without asking the server', async () => {
    const user = userEvent.setup()
    const fetch = stubServer()
    render(<RateScenario defaultRate={3} />)
    await screen.findByRole('list', { name: '세 가지 경우의 만기 금액' })

    await user.selectOptions(screen.getByLabelText('기준금리 변화 폭'), '0.5')
    await user.selectOptions(screen.getByLabelText('기간'), '24')
    const rate = screen.getByLabelText('지금 적금 금리(연 %)')
    await user.clear(rate)
    await user.type(rate, '4.5')
    await waitFor(() => expect(lastBody(fetch)).toEqual({ monthlyAmount: 500_000, months: 24, ratePercent: '4.5', step: '0.5' }))
    expect(screen.queryByText(/채워 두었어요/)).not.toBeInTheDocument()

    const calls = fetch.mock.calls.length
    await user.clear(rate)
    await user.type(rate, '3.455')
    expect(screen.getByRole('alert')).toHaveTextContent('소수 둘째 자리까지')
    expect(screen.queryByRole('list', { name: '세 가지 경우의 만기 금액' })).not.toBeInTheDocument()

    await user.clear(rate)
    await user.type(rate, '3')
    const monthly = screen.getByLabelText('월 납입액(원)')
    await user.clear(monthly)
    await user.type(monthly, '5000')
    expect(screen.getByRole('alert')).toHaveTextContent('월 납입액은 10,000원부터 10,000,000원까지')
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(fetch.mock.calls.slice(calls).every(([, init]) => JSON.parse(String(init?.body)).monthlyAmount !== 5000)).toBe(true)
  })

  it('says so when the server cannot calculate', async () => {
    stubServer(() => respond({ error: { code: 'internal_error', message: '서버에서 문제가 발생했습니다.' } }, 500))
    render(<RateScenario defaultRate={null} />)

    expect(await screen.findByText(/서버에서 문제가 발생했습니다/)).toBeInTheDocument()
    expect(screen.getByLabelText('지금 적금 금리(연 %)')).toHaveValue('3')
    expect(screen.queryByText(/채워 두었어요/)).not.toBeInTheDocument()
  })
})
