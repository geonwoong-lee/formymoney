import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { calculateEarlyExit, type ConditionAnswer, type ContributionType, type EarlyExitResponse } from '../api/client'

const won = (value: number) => `${value.toLocaleString('ko-KR')}원`

export type EarlyExitInput = {
  bankCode: string
  monthlyAmounts: number[]
  fixedMonthlyAmount: number
  contributionType: ContributionType
  conditionAnswers: Record<string, ConditionAnswer>
}

// 내 적금 화면 안의 "해지하기 전에" 카드: 저장한 값으로 지금 해지할 때와 해지하지 않을 때를 한눈에 보여 준다.
// 자세한 비교는 /early-exit 에서 한다. 실패해도 내 적금 화면 나머지는 그대로 보인다.
export function EarlyExitCard({ input, paidMonths }: { input: EarlyExitInput; paidMonths: number }) {
  const [state, setState] = useState<{ key: string; result: EarlyExitResponse | null } | null>(null)
  const key = `${JSON.stringify(input)}|${paidMonths}`
  const result = state?.key === key ? state.result : undefined

  useEffect(() => {
    const controller = new AbortController()
    calculateEarlyExit({ ...input, paidMonths }, controller.signal)
      .then((response) => setState({ key, result: response }))
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setState({ key, result: null })
      })
    return () => controller.abort()
    // input is covered by key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const pause = result?.scenarios.find((scenario) => scenario.key === 'pause')
  return <section className="my-savings__card" aria-labelledby="my-savings-exit">
    <h2 id="my-savings-exit">해지하기 전에</h2>
    {result === undefined && <p className="my-savings__muted">지금 해지할 때의 금액을 계산하는 중이에요.</p>}
    {result === null && <p className="my-savings__muted">해지 전 계산을 하지 못했어요. 아래 링크에서 다시 해 볼 수 있어요.</p>}
    {result && <>
      <p>{result.paidMonths}회차까지 내고 지금 해지하면 기본금리로 쳐도 <b>{won(result.termination.receivedAtBaseRate)}</b>을 받아요(참고값).
        {result.termination.lostGovernmentContribution > 0 && <> 쌓인 정부기여금 <b>{won(result.termination.lostGovernmentContribution)}</b>과 우대금리는 받지 못할 수 있어요.</>}</p>
      {pause && <p>해지하지 않고 남은 {result.monthsLeft}달을 한 푼도 안 넣고 두기만 해도 만기에 <b>{won(pause.expectedMaturityAmount)}</b>, 지금 해지보다 <b>{won(pause.moreThanTermination)}</b> 더 받아요.</p>}
    </>}
    <Link className="button button--secondary" to="/early-exit">해지 전 계산으로 자세히 비교하기</Link>
    <p className="my-savings__muted">해지를 권하거나 말리는 것이 아니라 결정 전에 차이를 보여 드리는 예상치예요. 실제 중도해지 이율은 은행마다 달라요.</p>
  </section>
}
