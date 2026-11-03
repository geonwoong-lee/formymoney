import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ELIGIBILITY_KEY } from '../features/eligibility'
import { EligibilityCheck } from './EligibilityCheck'

beforeEach(() => window.localStorage.clear())
afterEach(cleanup)

describe('EligibilityJudge', () => {
  it('asks for what the rules need, shows the result with its reasons, and sets the visitor’s answer without storing the numbers', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><EligibilityCheck /></MemoryRouter>)
    await user.click(screen.getByText('내 조건으로 확인해 보기'))

    await user.click(screen.getByRole('button', { name: '확인하기' }))
    expect(screen.getByRole('alert')).toHaveTextContent('생년월일을 넣어 주세요.')

    await user.type(screen.getByLabelText('생년월일'), '1999-05-20')
    await user.type(screen.getByLabelText('작년 총급여(만원)'), '3000')
    await user.type(screen.getByLabelText('가구 전체의 작년 소득(만원)'), '3000')
    await user.click(screen.getByLabelText('중소기업에 다니고 있어요'))
    await user.click(screen.getByRole('button', { name: '확인하기' }))

    expect(screen.getByRole('status')).toHaveTextContent('우대형 조건에 맞아요')
    expect(screen.getByRole('radio', { name: '대상이에요' })).toBeChecked()
    expect(window.localStorage.getItem(ELIGIBILITY_KEY)).toBe('eligible')
    expect(JSON.stringify(window.localStorage)).not.toContain('3000')

    await user.clear(screen.getByLabelText('가구 전체의 작년 소득(만원)'))
    await user.type(screen.getByLabelText('가구 전체의 작년 소득(만원)'), '9000')
    await user.click(screen.getByRole('button', { name: '확인하기' }))
    expect(screen.getByRole('status')).toHaveTextContent('가입 대상이 아니에요')
    expect(screen.getByRole('radio', { name: '대상이 아니에요' })).toBeChecked()
  })

  it('hides the household income box for five or more people and shows the couple box only for two', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><EligibilityCheck /></MemoryRouter>)
    await user.click(screen.getByText('내 조건으로 확인해 보기'))
    expect(screen.queryByLabelText('나와 배우자 둘뿐인 가구예요')).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('가구원 수(나 포함)'), '2')
    expect(screen.getByLabelText('나와 배우자 둘뿐인 가구예요')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('가구원 수(나 포함)'), '7')
    expect(screen.queryByLabelText('가구 전체의 작년 소득(만원)')).not.toBeInTheDocument()
  })
})
