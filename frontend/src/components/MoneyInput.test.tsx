import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { MoneyInput } from './MoneyInput'

function Harness({ seen }: { seen: (number | null)[] }) {
  const [value, setValue] = useState<number | null>(null)
  return <label>금액<MoneyInput value={value} onValueChange={(next) => { seen.push(next); setValue(next) }} /></label>
}

afterEach(cleanup)

describe('MoneyInput', () => {
  it('shows #,##0 while typing, ignores other characters and reports numbers', async () => {
    const user = userEvent.setup()
    const seen: (number | null)[] = []
    render(<Harness seen={seen} />)
    const input = screen.getByRole('textbox', { name: '금액' })

    await user.type(input, '1000000')
    expect(input).toHaveValue('1,000,000')
    expect(seen.at(-1)).toBe(1_000_000)

    await user.type(input, '원a')
    expect(input).toHaveValue('1,000,000')

    await user.clear(input)
    expect(input).toHaveValue('')
    expect(seen.at(-1)).toBeNull()
    expect(input).toHaveAttribute('inputmode', 'numeric')
  })

  it('reads a Korean amount as typed and shows it as #,##0 once the box is left', async () => {
    const user = userEvent.setup()
    const seen: (number | null)[] = []
    render(<Harness seen={seen} />)
    const input = screen.getByRole('textbox', { name: '금액' })

    await user.type(input, '30만원')
    expect(input).toHaveValue('30만원')  // left alone while the visitor is still writing
    expect(seen.at(-1)).toBe(300_000)
    await user.tab()
    expect(input).toHaveValue('300,000')

    await user.clear(input)
    await user.type(input, '1.5억')
    expect(seen.at(-1)).toBe(150_000_000)
    await user.tab()
    expect(input).toHaveValue('150,000,000')
  })

  it('takes full-width digits and goes back to plain formatting when the unit is deleted', async () => {
    const user = userEvent.setup()
    const seen: (number | null)[] = []
    render(<Harness seen={seen} />)
    const input = screen.getByRole('textbox', { name: '금액' })

    await user.type(input, '３００００')
    expect(input).toHaveValue('30,000')

    await user.clear(input)
    await user.type(input, '30만')
    await user.keyboard('{Backspace}')
    expect(input).toHaveValue('30')
    expect(seen.at(-1)).toBe(30)
  })
})

