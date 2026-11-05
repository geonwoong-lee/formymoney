import { FINAL_LEVEL } from './minesweeper'

export const MINESWEEPER_KEY = 'very-rich:minesweeper:v1'

// level: the level the next game starts at; best: the highest level ever cleared. Kept on this device only.
export interface MineProgress { level: number; best: number }

const clamp = (value: unknown, min: number): number => {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : min
  return Math.min(FINAL_LEVEL, Math.max(min, n))
}

export function loadMineProgress(storage: Storage = window.localStorage): MineProgress {
  try {
    const raw = storage.getItem(MINESWEEPER_KEY)
    if (!raw) return { level: 1, best: 0 }
    const value = JSON.parse(raw) as Partial<MineProgress>
    return { level: clamp(value.level, 1), best: clamp(value.best, 0) }
  } catch {
    return { level: 1, best: 0 }
  }
}

export function saveMineProgress(progress: MineProgress, storage: Storage = window.localStorage): void {
  try {
    storage.setItem(MINESWEEPER_KEY, JSON.stringify({ level: clamp(progress.level, 1), best: clamp(progress.best, 0) }))
  } catch {
    // The game still works for this visit when the browser will not store anything.
  }
}
