import type { SavingsCalculationResponse } from '../api/client'

const money = new Intl.NumberFormat('ko-KR')
const CONTRIBUTION = { preferred: '우대형 기여금', general: '일반형 기여금', none: '기여금 제외' } as const

// A 1200×630 card (the usual link-preview size) with the inputs and the top three banks, drawn on a canvas so
// nothing leaves the browser. Returns null where canvas is unavailable.
export function drawResultCard(result: SavingsCalculationResponse): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = 630
  const context = canvas.getContext('2d')
  if (!context) return null
  const font = '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif'

  context.fillStyle = '#c0c0c0'
  context.fillRect(0, 0, 1200, 630)
  context.fillStyle = '#000080'
  context.fillRect(0, 0, 1200, 70)
  context.fillStyle = '#ffffff'
  context.font = `bold 32px ${font}`
  context.fillText('Very Rich? · 청년미래적금 은행 비교', 32, 47)

  context.fillStyle = '#000000'
  context.font = `28px ${font}`
  context.fillText(`월 ${money.format(result.monthlyAmount)}원 · ${result.termMonths}개월 · ${CONTRIBUTION[result.contributionType]}`, 40, 125)

  result.results.slice(0, 3).forEach((bank, index) => {
    const top = 160 + index * 120
    context.fillStyle = '#ffffff'
    context.fillRect(40, top, 1120, 100)
    context.fillStyle = '#000080'
    context.font = `bold 40px ${font}`
    context.fillText(String(index + 1), 66, top + 64)
    context.fillStyle = '#000000'
    context.font = `bold 32px ${font}`
    context.fillText(bank.bankName, 130, top + 46)
    context.font = `24px ${font}`
    context.fillText(`예상금리 ${bank.expectedRate}%`, 130, top + 82)
    context.font = `bold 34px ${font}`
    context.textAlign = 'right'
    context.fillText(`${money.format(bank.expectedMaturityAmount)}원`, 1130, top + 60)
    context.textAlign = 'left'
  })

  context.fillStyle = '#333333'
  context.font = `22px ${font}`
  context.fillText('입력한 우대조건 답변 기준 예상치예요. 가입을 권하는 자료가 아니에요.', 40, 560)
  context.fillText(`공시 확인일 ${[...new Set(result.results.map((bank) => bank.sourceDate))].sort().join(', ')}`, 40, 596)
  return canvas
}

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  const link = document.createElement('a')
  link.href = canvas.toDataURL('image/png')
  link.download = filename
  link.click()
}
