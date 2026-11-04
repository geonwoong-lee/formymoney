import { useState, type InputHTMLAttributes } from 'react'
import { parseKoreanWon } from '../features/krw'

const MAX_DIGITS = 13
const MAX_WON = 10 ** MAX_DIGITS - 1

type MoneyInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'inputMode'> & {
  value: number | null
  onValueChange: (value: number | null) => void
}

// A won amount shown as #,##0 while typing (1,000,000). Plain digits (full-width ones too) are reformatted as you type; a Korean
// amount such as "30만원" or "1.5억" is left as typed until you leave the box, then shown as 300,000. Empty is null.
export function MoneyInput({ value, onValueChange, onBlur, ...rest }: MoneyInputProps) {
  const [typed, setTyped] = useState<string | null>(null)
  const formatted = value === null || !Number.isFinite(value) ? '' : value.toLocaleString('ko-KR')
  return <input
    {...rest}
    type="text"
    inputMode="numeric"
    autoComplete="off"
    value={typed ?? formatted}
    onChange={(event) => {
      const text = event.target.value
      const normalized = text.normalize('NFKC')
      const digits = normalized.replace(/\D/g, '').slice(0, MAX_DIGITS)
      const hasUnit = /[억만천백]/.test(normalized)
      if (hasUnit || normalized.includes('.')) {
        // Keep what was typed so "1.5" can still become "1.5억" and "30만" can become "300만"; the value follows as soon as it reads
        // as an amount (a bare "1.5" counts as the digits, like before).
        setTyped(text)
        const amount = hasUnit ? parseKoreanWon(text) : digits === '' ? null : Number(digits)
        onValueChange(amount === null ? null : Math.min(amount, MAX_WON))
        return
      }
      setTyped(null)
      onValueChange(digits === '' ? null : Number(digits))
    }}
    onBlur={(event) => { setTyped(null); onBlur?.(event) }}
  />
}
