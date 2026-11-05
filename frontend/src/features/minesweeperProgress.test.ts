import { afterEach, describe, expect, it } from 'vitest'
import { FINAL_LEVEL } from './minesweeper'
import { loadMineProgress, MINESWEEPER_KEY, saveMineProgress } from './minesweeperProgress'

afterEach(() => window.localStorage.clear())

describe('minesweeper progress', () => {
  it('starts at level 1 with no best when nothing was saved', () => {
    expect(loadMineProgress()).toEqual({ level: 1, best: 0 })
  })

  it('remembers the level to start at and the best level cleared', () => {
    saveMineProgress({ level: 4, best: 3 })
    expect(loadMineProgress()).toEqual({ level: 4, best: 3 })
  })

  it('never goes past the final level or below the first', () => {
    saveMineProgress({ level: 99, best: 99 })
    expect(loadMineProgress()).toEqual({ level: FINAL_LEVEL, best: FINAL_LEVEL })
    window.localStorage.setItem(MINESWEEPER_KEY, JSON.stringify({ level: -5, best: -1 }))
    expect(loadMineProgress()).toEqual({ level: 1, best: 0 })
  })

  it('falls back to the start when the saved value is broken', () => {
    window.localStorage.setItem(MINESWEEPER_KEY, '{not json')
    expect(loadMineProgress()).toEqual({ level: 1, best: 0 })
    window.localStorage.setItem(MINESWEEPER_KEY, JSON.stringify({ level: 'high', best: null }))
    expect(loadMineProgress()).toEqual({ level: 1, best: 0 })
  })

  it('does not break the game when the browser refuses to store anything', () => {
    const refusing = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } } as unknown as Storage
    expect(() => saveMineProgress({ level: 2, best: 1 }, refusing)).not.toThrow()
    expect(loadMineProgress(refusing)).toEqual({ level: 1, best: 0 })
  })
})
