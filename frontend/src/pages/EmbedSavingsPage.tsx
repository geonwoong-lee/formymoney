import { useEffect, useRef, useState } from 'react'
import { getSavingsEstimate, type ContributionType, type SavingsEstimateResponse } from '../api/client'
import { MoneyInput } from '../components/MoneyInput'
import './EmbedSavingsPage.css'

const money = new Intl.NumberFormat('ko-KR')
const won = (value: number) => `${money.format(value)}원`

// 넣은 사이트가 주소에 시작값을 줄 수 있다: /embed/savings?amount=300000&type=preferred
function startValues(search: string) {
  const params = new URLSearchParams(search)
  const amount = Number(params.get('amount'))
  const type = params.get('type')
  return {
    amount: Number.isInteger(amount) && amount >= 1_000 && amount <= 500_000 && amount % 1_000 === 0 ? amount : 500_000,
    type: (type === 'preferred' || type === 'none' ? type : 'general') as ContributionType,
  }
}

function amountError(amount: number) {
  if (amount < 1_000 || amount > 500_000) return '월 1,000원부터 500,000원까지 넣을 수 있어요.'
  if (amount % 1_000 !== 0) return '1,000원 단위로 넣어 주세요.'
  return ''
}

// 다른 사이트에 넣는 청년미래적금 예상 만기액 계산기. 개인 정보는 받지 않고 브라우저에도 저장하지 않는다.
export function EmbedSavingsPage() {
  const [start] = useState(() => startValues(window.location.search))
  const [amount, setAmount] = useState(start.amount)
  const [type, setType] = useState<ContributionType>(start.type)
  const [result, setResult] = useState<SavingsEstimateResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const requestId = useRef(0)
  const invalid = amountError(amount)

  async function calculate(nextAmount = amount, nextType = type) {
    if (amountError(nextAmount)) return
    const id = requestId.current + 1
    requestId.current = id
    setLoading(true)
    setError('')
    // 새 입력으로 계산하는 동안과 실패했을 때 이전 입력의 결과가 남아 보이지 않게 한다.
    setResult(null)
    try {
      const response = await getSavingsEstimate(nextAmount, nextType)
      if (requestId.current === id) setResult(response)
    } catch (cause) {
      if (requestId.current === id) setError(cause instanceof Error ? cause.message : '계산하지 못했어요.')
    } finally {
      if (requestId.current === id) setLoading(false)
    }
  }

  useEffect(() => {
    void calculate(start.amount, start.type)
    // 처음 한 번만 시작값으로 계산한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const home = window.location.origin

  return (
    <main className="embed-savings">
      <h1>청년미래적금 예상 만기액</h1>
      <form className="embed-savings__form" onSubmit={(event) => { event.preventDefault(); void calculate() }}>
        <label>월 납입액
          <MoneyInput value={amount} aria-invalid={invalid !== ''} onValueChange={(value) => { setAmount(value ?? 0); requestId.current += 1; setResult(null); setLoading(false) }} />
        </label>
        <label>정부기여금
          <select value={type} onChange={(event) => { const next = event.target.value as ContributionType; setType(next); void calculate(amount, next) }}>
            <option value="general">일반형(6%)</option>
            <option value="preferred">우대형(12%)</option>
            <option value="none">받지 않음</option>
          </select>
        </label>
        <button type="submit" disabled={loading || invalid !== ''}>{loading ? '계산 중…' : '계산'}</button>
      </form>
      {invalid && <p className="embed-savings__error" role="alert">{invalid}</p>}
      {error && <p className="embed-savings__error" role="alert">{error}</p>}
      {result && <>
        <p className="embed-savings__summary">{result.termMonths}개월 동안 넣는 돈 {won(result.principal)} · 은행 이름 순</p>
        <p className="embed-savings__note">두 금액은 공시된 기본금리만 받는 경우와 최고금리를 받는 경우를 가정한 범위예요. 실제 금리는 내가 채우는 우대조건과 은행 심사에 따라 이 사이 어딘가, 또는 확인이 필요한 조건 때문에 더 낮을 수 있어요.</p>
        <div className="embed-savings__table-wrap">
          <table>
            <caption className="sr-only">은행별 예상 만기액 범위</caption>
            <thead><tr><th scope="col">은행</th><th scope="col">기본금리 가정</th><th scope="col">공시 최고금리 가정</th></tr></thead>
            <tbody>{[...result.banks].sort((a, b) => a.bankName.localeCompare(b.bankName, 'ko')).map((bank) => <tr key={bank.bankCode}>
              <th scope="row">{bank.bankName}<small><a href={bank.sourceUrl} target="_blank" rel="noreferrer">공시 {bank.sourceDate}</a></small></th>
              <td>{won(bank.maturityAtBaseRate)}<small>{bank.baseRate}%</small></td>
              <td>{won(bank.maturityAtMaximumRate)}<small>{bank.maximumRate}%</small></td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className="embed-savings__note">{result.disclaimer} 금리는 은행별 공시 확인일 기준이며, 기간·기여금은 <a href={result.policySourceUrl} target="_blank" rel="noreferrer">정책 안내</a>({result.policySourceDate} 확인)를 따릅니다.</p>
      </>}
      <p className="embed-savings__brand"><a href={`${home}/conditions`} target="_blank" rel="noreferrer">내 우대조건으로 예상해 보기 · Very Rich?</a></p>
    </main>
  )
}
