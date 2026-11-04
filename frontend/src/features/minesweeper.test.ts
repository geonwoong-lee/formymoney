import { describe, expect, it } from 'vitest'
import { emptyBoard, FINAL_LEVEL, isCleared, levelConfig, neighbors, openCell, placeMines } from './minesweeper'

describe('levelConfig', () => {
  it('starts with the classic 9×9 board and 10 mines', () => {
    expect(levelConfig(1)).toEqual({ level: 1, size: 9, mines: 10 })
  })

  it('never gets easier: each level has at least as many mines and cells as the one before', () => {
    for (let level = 2; level <= FINAL_LEVEL + 3; level += 1) {
      const before = levelConfig(level - 1); const now = levelConfig(level)
      expect(now.mines).toBeGreaterThanOrEqual(before.mines)
      expect(now.size).toBeGreaterThanOrEqual(before.size)
    }
  })

  it('steps up one notch at a time until the final level, then stays', () => {
    for (let level = 2; level <= FINAL_LEVEL; level += 1) {
      const before = levelConfig(level - 1); const now = levelConfig(level)
      expect(now.mines > before.mines || now.size > before.size).toBe(true)
      expect(now.mines - before.mines).toBeLessThanOrEqual(12)
    }
    expect(levelConfig(FINAL_LEVEL + 1)).toEqual({ ...levelConfig(FINAL_LEVEL), level: FINAL_LEVEL + 1 })
  })

  it('keeps mines at or under a quarter of the cells', () => {
    for (let level = 1; level <= FINAL_LEVEL + 3; level += 1) {
      const { size, mines } = levelConfig(level)
      expect(mines / (size * size)).toBeLessThanOrEqual(0.25)
    }
  })

  it('treats nonsense levels as level 1', () => {
    expect(levelConfig(0).level).toBe(1)
    expect(levelConfig(Number.NaN).level).toBe(1)
  })
})

describe('placeMines', () => {
  it('places exactly the asked number of mines and counts neighbours', () => {
    const board = placeMines(emptyBoard(9), 9, 10, 40)
    expect(board.filter((cell) => cell.mine)).toHaveLength(10)
    board.forEach((cell, index) => expect(cell.nearby).toBe(neighbors(index, 9).filter((other) => board[other].mine).length))
  })

  it('keeps the first click and its neighbours free of mines for any random sequence', () => {
    for (const first of [0, 8, 40, 72, 80]) {
      for (const random of [() => 0, () => 0.999, () => 0.5, Math.random]) {
        const board = placeMines(emptyBoard(9), 9, 10, first, random)
        for (const index of [first, ...neighbors(first, 9)]) expect(board[index].mine).toBe(false)
      }
    }
  })

  it('still places every mine on the biggest board with the corner as the first click', () => {
    const { size, mines } = levelConfig(FINAL_LEVEL)
    const board = placeMines(emptyBoard(size), size, mines, 0)
    expect(board.filter((cell) => cell.mine)).toHaveLength(mines)
    expect(board[0].mine).toBe(false)
  })
})

describe('openCell', () => {
  it('opens a whole empty area from one click', () => {
    const board = placeMines(emptyBoard(9), 9, 10, 40, () => 0)
    const { board: opened, hitMine } = openCell(board, 9, 40)
    expect(hitMine).toBe(false)
    expect(opened[40].revealed).toBe(true)
    for (const index of neighbors(40, 9)) expect(opened[index].revealed).toBe(true)
  })

  it('shows every mine when one is hit', () => {
    const board = placeMines(emptyBoard(9), 9, 10, 40, () => 0)
    const mine = board.findIndex((cell) => cell.mine)
    const { board: lost, hitMine } = openCell(board, 9, mine)
    expect(hitMine).toBe(true)
    expect(lost.filter((cell) => cell.mine).every((cell) => cell.revealed)).toBe(true)
  })

  it('leaves flagged cells shut when opening an area', () => {
    const board = placeMines(emptyBoard(9), 9, 10, 40, () => 0)
    board[41].flagged = true
    const { board: opened } = openCell(board, 9, 40)
    expect(opened[41].revealed).toBe(false)
  })
})

describe('isCleared', () => {
  it('is true only when every cell without a mine is open', () => {
    const board = placeMines(emptyBoard(9), 9, 10, 40, () => 0)
    expect(isCleared(board)).toBe(false)
    const opened = board.map((cell) => ({ ...cell, revealed: !cell.mine }))
    expect(isCleared(opened)).toBe(true)
    opened[opened.findIndex((cell) => !cell.mine)].revealed = false
    expect(isCleared(opened)).toBe(false)
  })
})
