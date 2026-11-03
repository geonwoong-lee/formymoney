import { bankLogoUrl } from '../features/bankLogos'
import { bankIconPaths, BANK_HEIGHT, BANK_WIDTH, roofColor } from '../features/bankPixelIcon'
import { bankMark } from '../features/bankMark'
import './BankBadge.css'

// The bank's icon in front of its name: the library icon when there is one, otherwise a pixel-art bank building whose
// roof color is picked from the bank's mark. Hidden from screen readers because the name is written beside it.
export function BankBadge({ bankCode, bankName, scale = 2 }: { bankCode?: string; bankName: string; scale?: 2 | 3 }) {
  const logo = bankLogoUrl(bankCode, bankName)
  if (logo) {
    const size = 14 * scale
    return <img className="bank-badge bank-badge--logo" src={logo} width={size} height={size} alt="" aria-hidden="true" loading="lazy" decoding="async" />
  }
  const paths = bankIconPaths(roofColor(bankMark(bankCode, bankName)))
  return <svg className="bank-badge" viewBox={`0 0 ${BANK_WIDTH} ${BANK_HEIGHT}`} width={BANK_WIDTH * scale} height={BANK_HEIGHT * scale} shapeRendering="crispEdges" aria-hidden="true" focusable="false">
    {paths.map((path) => <path key={path.color} d={path.d} fill={path.color} />)}
  </svg>
}
