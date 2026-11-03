import { bankIconPaths, BANK_HEIGHT, BANK_WIDTH, roofColor } from '../features/bankPixelIcon'
import { bankMark } from '../features/bankMark'
import './BankBadge.css'

// A pixel-art bank building in front of a bank's name. The same drawing for every bank, with only the roof color
// changing, so it is not any bank's logo. Hidden from screen readers because the name is written beside it.
export function BankBadge({ bankCode, bankName, scale = 2 }: { bankCode?: string; bankName: string; scale?: 2 | 3 }) {
  const paths = bankIconPaths(roofColor(bankMark(bankCode, bankName)))
  return <svg className="bank-badge" viewBox={`0 0 ${BANK_WIDTH} ${BANK_HEIGHT}`} width={BANK_WIDTH * scale} height={BANK_HEIGHT * scale} shapeRendering="crispEdges" aria-hidden="true" focusable="false">
    {paths.map((path) => <path key={path.color} d={path.d} fill={path.color} />)}
  </svg>
}
