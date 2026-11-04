// Minesweeper rules for the 지뢰찾기 desktop toy: levels that get a little harder each time the board is cleared.

export interface MineCell { mine: boolean; revealed: boolean; flagged: boolean; nearby: number }
export interface MineLevel { level: number; size: number; mines: number }

// Level 1 is the classic 9×9 with 10 mines; every later level adds mines or a few rows, one step at a time.
const STEPS: ReadonlyArray<readonly [size: number, mines: number]> = [[9, 10], [9, 12], [10, 16], [12, 24], [14, 36], [16, 48]]
const BIGGEST = 16
const MAX_DENSITY = 0.25
const MINES_PER_LATER_LEVEL = 4

export function levelConfig(level: number): MineLevel {
  const n = Math.max(1, Math.floor(level) || 1)
  if (n <= STEPS.length) return { level: n, size: STEPS[n - 1][0], mines: STEPS[n - 1][1] }
  const cap = Math.floor(BIGGEST * BIGGEST * MAX_DENSITY)
  return { level: n, size: BIGGEST, mines: Math.min(cap, STEPS[STEPS.length - 1][1] + (n - STEPS.length) * MINES_PER_LATER_LEVEL) }
}

// The last level that is harder than the one before it; after it the board stays the same.
export const FINAL_LEVEL = (() => { let n = 1; while (levelConfig(n + 1).mines > levelConfig(n).mines || levelConfig(n + 1).size > levelConfig(n).size) n += 1; return n })()

export function neighbors(index: number, size: number): number[] {
  const row = Math.floor(index / size); const col = index % size; const found: number[] = []
  for (let y = Math.max(0, row - 1); y <= Math.min(size - 1, row + 1); y += 1) {
    for (let x = Math.max(0, col - 1); x <= Math.min(size - 1, col + 1); x += 1) if (y * size + x !== index) found.push(y * size + x)
  }
  return found
}

export function emptyBoard(size: number): MineCell[] {
  return Array.from({ length: size * size }, () => ({ mine: false, revealed: false, flagged: false, nearby: 0 }))
}

// Mines go in after the first click so the first click can never lose: they keep off that cell and, when there is room, off its neighbours too.
export function placeMines(board: MineCell[], size: number, mines: number, firstClick: number, random: () => number = Math.random): MineCell[] {
  const near = new Set([firstClick, ...neighbors(firstClick, size)])
  let candidates = board.map((_, index) => index).filter((index) => !near.has(index))
  if (candidates.length < mines) candidates = board.map((_, index) => index).filter((index) => index !== firstClick)
  const chosen = new Set<number>()
  for (let pick = 0; pick < mines && candidates.length > 0; pick += 1) {
    const at = Math.min(candidates.length - 1, Math.floor(random() * candidates.length))
    chosen.add(candidates[at])
    candidates = candidates.filter((_, position) => position !== at)
  }
  return board.map((cell, index) => ({
    ...cell,
    mine: chosen.has(index),
    nearby: neighbors(index, size).filter((other) => chosen.has(other)).length,
  }))
}

// Opens a cell and, for a cell with no mines around it, everything that opens with it. Flagged cells stay shut.
export function openCell(board: MineCell[], size: number, index: number): { board: MineCell[]; hitMine: boolean } {
  const next = board.map((cell) => ({ ...cell }))
  const queue = [index]; const seen = new Set<number>()
  while (queue.length > 0) {
    const current = queue.pop() as number
    if (seen.has(current)) continue
    seen.add(current); next[current].revealed = true
    if (next[current].mine) { next.forEach((cell) => { if (cell.mine) cell.revealed = true }); return { board: next, hitMine: true } }
    if (next[current].nearby === 0) for (const other of neighbors(current, size)) if (!next[other].flagged) queue.push(other)
  }
  return { board: next, hitMine: false }
}

export function isCleared(board: MineCell[]): boolean {
  return board.every((cell) => cell.mine || cell.revealed)
}
