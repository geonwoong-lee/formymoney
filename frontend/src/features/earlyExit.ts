// 가입한 달부터 이번 달까지 몇 회차인지. 모르면 1년(12회)을 기본으로 둔다. 1~(기간-1) 안으로 맞춘다.
export function defaultPaidMonths(startMonth: string | undefined, enrolled: boolean, termMonths: number, today = new Date()) {
  let rounds = 12
  if (enrolled && startMonth) {
    const [year, month] = startMonth.split('-').map(Number)
    rounds = (today.getFullYear() - year) * 12 + (today.getMonth() + 1 - month) + 1
  }
  return Math.min(Math.max(rounds, 1), termMonths - 1)
}

// 낸 돈 대비 받는 돈: "+137,475원(+2.3%)". 원금이 0이면 비율은 뺀다.
export function gainLabel(principal: number, received: number) {
  const gain = received - principal
  const sign = gain > 0 ? '+' : gain < 0 ? '-' : ''
  const amount = `${sign}${Math.abs(gain).toLocaleString('ko-KR')}원`
  if (principal <= 0) return amount
  const percent = (Math.abs(gain) / principal * 100).toFixed(1)
  return `${amount}(${sign}${percent}%)`
}
