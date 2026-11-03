import { describe, expect, it } from 'vitest'
import { BANK_GRID, BANK_WIDTH, bankIconPaths, roofColor } from './bankPixelIcon'

describe('bank pixel icon', () => {
  it('is a rectangular grid made only of known pixels and symmetric left to right', () => {
    for (const row of BANK_GRID) {
      expect(row).toHaveLength(BANK_WIDTH)
      expect(row).toMatch(/^[.kwgya]+$/)
      expect([...row].reverse().join('').replace(/wg/g, 'gw')).toBe(row.replace(/wg/g, 'gw'))
    }
  })

  it('paints the roof with the bank color and everything else with fixed colors', () => {
    const paths = bankIconPaths('#123456')
    expect(paths.map((path) => path.color)).toContain('#123456')
    expect(paths.find((path) => path.color === '#123456')?.d).toContain('M6 1h1v1h-1z')
    expect(new Set(paths.map((path) => path.color)).size).toBe(paths.length)
  })

  it('gives the same bank the same roof every time, and spreads banks over several colors', () => {
    expect(roofColor('KB')).toBe(roofColor('KB'))
    const roofs = new Set(['KB', '신한', 'NH', '우리', '하나', 'IBK', '우체국', 'Sh', 'iM', 'BNK', '광주', '전북', '카카오'].map(roofColor))
    expect(roofs.size).toBeGreaterThanOrEqual(4)
  })
})
