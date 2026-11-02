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
})
