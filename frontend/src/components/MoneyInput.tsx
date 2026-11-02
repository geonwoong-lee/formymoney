import type { InputHTMLAttributes } from 'react'

const MAX_DIGITS = 13

type MoneyInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'inputMode'> & {
  value: number | null
  onValueChange: (value: number | null) => void
}

// A won amount shown as #,##0 while typing (1,000,000). Anything but digits is ignored; empty is null.
export function MoneyInput({ value, onValueChange, ...rest }: MoneyInputProps) {
  return <input
    {...rest}
    type="text"
    inputMode="numeric"
    autoComplete="off"
    value={value === null || !Number.isFinite(value) ? '' : value.toLocaleString('ko-KR')}
    onChange={(event) => {
      const digits = event.target.value.replace(/\D/g, '').slice(0, MAX_DIGITS)
      onValueChange(digits === '' ? null : Number(digits))
    }}
  />
}
