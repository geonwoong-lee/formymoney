import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { RateScenario } from './RateScenario'
import { savingsAtMaturity } from './rateScenarioMath'

afterEach(cleanup)

describe('savingsAtMaturity', () => {
  it('counts simple interest by months left, like the savings calculator, and takes 15.4% tax', () => {
    // 500,000 × 3% × (12 × 13 / 2) / 12 = 97,500; tax floor(97,500 × 0.154) = 15,015
    expect(savingsAtMaturity(500_000, 12, 3)).toEqual({ rate: 3, principal: 6_000_000, interest: 97_500, tax: 15_015, afterTax: 6_082_485 })
    expect(savingsAtMaturity(500_000, 12, -0.5)).toEqual({ rate: 0, principal: 6_000_000, interest: 0, tax: 0, afterTax: 6_000_000 })
  })
})

describe('RateScenario', () => {
  it('shows the three cases side by side from the average deposit rate, with their differences', async () => {
    render(<RateScenario defaultRate={3} />)

    const cases = within(screen.getByRole('list', { name: '세 가지 경우의 만기 금액' })).getAllByRole('listitem')
    expect(cases.map((item) => item.querySelector('b')?.textContent)).toEqual([
      '기준금리가 0.25%p 오르면', '기준금리가 그대로면', '기준금리가 0.25%p 내리면',
    ])
    // 3.25%: interest 105,625, tax 16,266 → 6,089,359; 2.75%: interest 89,375, tax 13,763 → 6,075,612
    expect(cases[0]).toHaveTextContent('적금 금리 3.25%6,089,359원')
    expect(cases[0]).toHaveTextContent('그대로일 때보다 +6,874원')
    expect(cases[1]).toHaveTextContent('6,082,485원')
    expect(cases[2]).toHaveTextContent('그대로일 때보다 −6,873원')
    expect(screen.getByText(/은행 예금 평균금리\(신규\) 3%로 채워 두었어요/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '만약 기준금리가 바뀐다면?' })).toHaveTextContent('어느 경우가 될지 예측하지 않아요')
  })

  it('recalculates when the amount, period, rate or step changes, and explains bad input', async () => {
    const user = userEvent.setup()
    render(<RateScenario defaultRate={3} />)

    await user.selectOptions(screen.getByLabelText('기준금리 변화 폭'), '0.5')
    await user.selectOptions(screen.getByLabelText('기간'), '24')
    const rate = screen.getByLabelText('지금 적금 금리(연 %)')
    await user.clear(rate)
    await user.type(rate, '4')
    expect(screen.queryByText(/채워 두었어요/)).not.toBeInTheDocument()
    const cases = within(screen.getByRole('list', { name: '세 가지 경우의 만기 금액' })).getAllByRole('listitem')
    expect(cases[0]).toHaveTextContent('기준금리가 0.5%p 오르면적금 금리 4.5%')
    expect(cases[1]).toHaveTextContent(`${savingsAtMaturity(500_000, 24, 4).afterTax.toLocaleString('ko-KR')}원`)

    const monthly = screen.getByLabelText('월 납입액(원)')
    await user.clear(monthly)
    await user.type(monthly, '5000')
    expect(screen.getByRole('alert')).toHaveTextContent('월 납입액은 10,000원부터 10,000,000원까지')
    expect(screen.queryByRole('list', { name: '세 가지 경우의 만기 금액' })).not.toBeInTheDocument()

    await user.clear(monthly)
    await user.type(monthly, '300,000')
    await user.clear(rate)
    expect(screen.getByRole('alert')).toHaveTextContent('적금 금리는 0%부터 20%까지')
  })

  it('starts from 3% when the average deposit rate is not available', () => {
    render(<RateScenario defaultRate={null} />)
    expect(screen.getByLabelText('지금 적금 금리(연 %)')).toHaveValue('3')
    expect(screen.queryByText(/채워 두었어요/)).not.toBeInTheDocument()
  })
})
