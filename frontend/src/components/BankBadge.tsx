import { bankMark } from '../features/bankMark'
import './BankBadge.css'

export function BankBadge({ bankCode, bankName }: { bankCode?: string; bankName: string }) {
  const mark = bankMark(bankCode, bankName)
  // Hidden from screen readers: the bank's name is always written next to it.
  return <span className={`bank-badge${mark.length > 2 ? ' bank-badge--long' : ''}`} aria-hidden="true">{mark}</span>
}
