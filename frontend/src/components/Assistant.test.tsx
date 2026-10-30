import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Assistant, ASSISTANT_HIDDEN_KEY, ASSISTANT_SEEN_KEY } from './Assistant'
import { findAnswer } from './assistantAnswers'

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

function renderAssistant(greet = false) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes><Route path="*" element={<><Where /><Assistant greetOnFirstVisit={greet} /></>} /></Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => window.localStorage.clear())
afterEach(cleanup)

describe('Assistant', () => {
  it('stays closed until the dog is clicked, then asks the greeting question', async () => {
    const user = userEvent.setup()
    renderAssistant()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '도우미에게 물어보기' }))

    const bubble = screen.getByRole('dialog')
    expect(within(bubble).getByText('무엇을 도와 드릴까요?')).toBeInTheDocument()
    expect(within(bubble).getByRole('textbox')).toHaveFocus()
  })

  it('answers with a link and navigates when it is chosen', async () => {
    const user = userEvent.setup()
    renderAssistant()
    await user.click(screen.getByRole('button', { name: '도우미에게 물어보기' }))

    await user.type(screen.getByRole('textbox'), '이번 달 납입을 빠뜨렸어요{Enter}')
    expect(screen.getByRole('status')).toHaveTextContent('빠뜨린 달을 반영')
    await user.click(within(screen.getByRole('status')).getByRole('button', { name: '월별 납입 계획' }))

    expect(screen.getByTestId('where')).toHaveTextContent('/cashflow')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('never recommends a product and says so', async () => {
    const user = userEvent.setup()
    renderAssistant()
    await user.click(screen.getByRole('button', { name: '도우미에게 물어보기' }))

    await user.type(screen.getByRole('textbox'), '어떤 적금을 추천해?')
    await user.click(screen.getByRole('button', { name: '찾기(S)' }))

    expect(screen.getByRole('status')).toHaveTextContent('추천하거나 가입을 권하지 않아요')
  })

  it('falls back to the list of topics when nothing matches', async () => {
    const user = userEvent.setup()
    renderAssistant()
    await user.click(screen.getByRole('button', { name: '도우미에게 물어보기' }))

    await user.type(screen.getByRole('textbox'), '날씨 어때요{Enter}')

    const answer = screen.getByRole('status')
    expect(answer).toHaveTextContent('잘 모르겠어요')
    expect(within(answer).getAllByRole('button')).toHaveLength(6)
  })

  it('can be hidden, stays hidden after a reload, and can be called back', async () => {
    const user = userEvent.setup()
    const first = renderAssistant()
    await user.click(screen.getByRole('button', { name: '도우미에게 물어보기' }))
    await user.click(screen.getByRole('button', { name: '옵션(O)' }))
    await user.click(screen.getByRole('menuitem', { name: '도우미 숨기기' }))

    expect(window.localStorage.getItem(ASSISTANT_HIDDEN_KEY)).toBe('1')
    expect(screen.queryByRole('button', { name: '도우미에게 물어보기' })).not.toBeInTheDocument()
    first.unmount()

    renderAssistant()
    expect(screen.queryByRole('button', { name: '도우미에게 물어보기' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '도우미 다시 부르기' }))

    expect(window.localStorage.getItem(ASSISTANT_HIDDEN_KEY)).toBeNull()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('greets only on the first visit when asked to', () => {
    const first = renderAssistant(true)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(window.localStorage.getItem(ASSISTANT_SEEN_KEY)).toBe('1')
    first.unmount()

    renderAssistant(true)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes the bubble with Escape', async () => {
    const user = userEvent.setup()
    renderAssistant()
    await user.click(screen.getByRole('button', { name: '도우미에게 물어보기' }))
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('Assistant dragging', () => {
  it('moves when dragged without opening the bubble, and still opens on a plain click', async () => {
    const user = userEvent.setup()
    renderAssistant()
    const dog = screen.getByRole('button', { name: '도우미에게 물어보기' })
    const container = screen.getByLabelText('도우미 머니독')

    fireEvent.pointerDown(dog, { pointerId: 1, button: 0, clientX: 20, clientY: 600 })
    fireEvent.pointerMove(dog, { pointerId: 1, clientX: 120, clientY: 520 })
    fireEvent.pointerUp(dog, { pointerId: 1 })
    fireEvent.click(dog)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(container.style.transform).toBe('translate(100px, -80px)')

    await user.click(dog)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('treats a tiny wobble as a click', () => {
    renderAssistant()
    const dog = screen.getByRole('button', { name: '도우미에게 물어보기' })

    fireEvent.pointerDown(dog, { pointerId: 1, button: 0, clientX: 20, clientY: 600 })
    fireEvent.pointerMove(dog, { pointerId: 1, clientX: 22, clientY: 601 })
    fireEvent.pointerUp(dog, { pointerId: 1 })
    fireEvent.click(dog)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('도우미 머니독').style.transform).toBe('translate(0px, 0px)')
  })
})

describe('findAnswer', () => {
  it('matches the most specific topic first and ignores case and spacing', () => {
    expect(findAnswer('  ETF 투자 어때요 ').links[0].to).toBe('/alternatives')
    expect(findAnswer('청년미래적금 우대금리 조건').links[0].to).toBe('/conditions')
    expect(findAnswer('로그인이 안돼요').links[0].to).toBe('/auth')
    expect(findAnswer('').links.length).toBeGreaterThan(1)
  })
})
