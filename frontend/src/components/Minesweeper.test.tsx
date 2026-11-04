import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyBoard, levelConfig, placeMines } from '../features/minesweeper'
import { RetroUtilityApp } from './RetroUtilityApps'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const noop = () => undefined
function renderGame() {
  return render(<RetroUtilityApp kind="minesweeper" folderItems={[]} onOpenUtility={noop} onAddFolderItem={noop} onRemoveFolderItem={noop} />)
}

function cell(size: number, index: number) {
  return screen.getByRole('gridcell', { name: new RegExp(`^${Math.floor(index / size) + 1}행 ${index % size + 1}열`) })
}

// With Math.random fixed at 0 the layout is known, so the test can clear a board without guessing.
async function clearBoard(user: ReturnType<typeof userEvent.setup>, level: number, firstClick: number) {
  const { size, mines } = levelConfig(level)
  const layout = placeMines(emptyBoard(size), size, mines, firstClick, () => 0)
  await user.click(cell(size, firstClick))
  for (let index = 0; index < size * size; index += 1) {
    if (layout[index].mine || cell(size, index).classList.contains('is-revealed')) continue
    await user.click(cell(size, index))
  }
}

describe('Minesweeper', () => {
  it('starts at level 1 with a 9×9 board and 10 mines', () => {
    renderGame()
    expect(screen.getByRole('grid', { name: '9 곱하기 9 지뢰찾기 판' })).toBeInTheDocument()
    expect(screen.getAllByRole('gridcell')).toHaveLength(81)
    expect(screen.getByText(/레벨 1 · 지뢰 10개/)).toBeInTheDocument()
  })

  it('never loses on the first click', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const user = userEvent.setup()
    renderGame()
    await user.click(cell(9, 0))
    expect(screen.queryByText(/지뢰를 밟았어요/)).not.toBeInTheDocument()
  })

  it('offers the next, harder level when a board is cleared and keeps going up one step at a time', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const user = userEvent.setup()
    renderGame()

    await clearBoard(user, 1, 40)
    expect(screen.getByRole('status')).toHaveTextContent('레벨 1 클리어!')
    const second = levelConfig(2)
    await user.click(screen.getByRole('button', { name: new RegExp(`다음 레벨 \\(${second.size}×${second.size}, 지뢰 ${second.mines}개\\)`) }))
    expect(screen.getByText(new RegExp(`레벨 2 · 지뢰 ${second.mines}개`))).toBeInTheDocument()
    expect(screen.getAllByRole('gridcell')).toHaveLength(second.size * second.size)

    await clearBoard(user, 2, 40)
    expect(screen.getByRole('status')).toHaveTextContent('레벨 2 클리어!')
    await user.click(screen.getAllByRole('button', { name: /^다음 레벨/ })[0])
    const third = levelConfig(3)
    expect(screen.getByRole('grid', { name: `${third.size} 곱하기 ${third.size} 지뢰찾기 판` })).toBeInTheDocument()
    expect(third.size * third.size + third.mines).toBeGreaterThan(second.size * second.size + second.mines)
  })

  it('keeps the same level after a loss', async () => {
    // A scattered layout, so the first click opens only part of the board.
    let seed = 7
    const scattered = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647 }
    vi.spyOn(Math, 'random').mockImplementation(scattered)
    const user = userEvent.setup()
    renderGame()
    const { size, mines } = levelConfig(1)
    seed = 7
    const layout = placeMines(emptyBoard(size), size, mines, 40, scattered)
    seed = 7
    await user.click(cell(size, 40))
    await user.click(cell(size, layout.findIndex((c) => c.mine)))

    expect(screen.getByRole('status')).toHaveTextContent('지뢰를 밟았어요')
    await user.click(screen.getByRole('button', { name: '새 게임' }))
    expect(screen.getByText(/레벨 1 · 지뢰 10개/)).toBeInTheDocument()
  })

  it('counts flags down from the level mine count', async () => {
    const user = userEvent.setup()
    renderGame()
    await user.pointer({ keys: '[MouseRight]', target: cell(9, 0) })
    expect(screen.getByText('009')).toBeInTheDocument()
  })
})
