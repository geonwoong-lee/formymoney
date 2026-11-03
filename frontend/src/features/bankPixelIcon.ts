// A pixel-art bank building, one 13x14 grid shared by every bank. Only the roof color changes from bank to bank, picked
// from the Win95 palette by the bank's mark, so the rows are easy to tell apart without copying any bank's logo or colors.
export const BANK_GRID = [
  '......k......',
  '.....kak.....',
  '....kaaak....',
  '...kaaaaak...',
  '..kaaayaaak..',
  '.kaaaaaaaaak.',
  'kkkkkkkkkkkkk',
  'kwgkwgkwgkwgk',
  'kwgkwgkwgkwgk',
  'kwgkwgkwgkwgk',
  'kwgkwgkwgkwgk',
  'kkkkkkkkkkkkk',
  'kgggggggggggk',
  'kkkkkkkkkkkkk',
]

export const BANK_WIDTH = 13
export const BANK_HEIGHT = BANK_GRID.length

const ROOFS = ['#000080', '#008080', '#800000', '#808000', '#800080', '#006000', '#a05000', '#404040']
const FIXED: Record<string, string> = { k: '#000000', w: '#ffffff', g: '#c0c0c0', y: '#e0b000' }

export function roofColor(mark: string): string {
  let hash = 0
  for (const char of mark) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return ROOFS[hash % ROOFS.length]
}

// One path per color, each pixel a 1x1 square, so the icon stays sharp at any size.
export function bankIconPaths(roof: string): { color: string; d: string }[] {
  const byColor = new Map<string, string>()
  BANK_GRID.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const code = row[x]
      if (code === '.') continue
      const color = code === 'a' ? roof : FIXED[code]
      byColor.set(color, `${byColor.get(color) ?? ''}M${x} ${y}h1v1h-1z`)
    }
  })
  return [...byColor].map(([color, d]) => ({ color, d }))
}
