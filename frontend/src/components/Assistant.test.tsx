import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Assistant, ASSISTANT_HIDDEN_KEY, ASSISTANT_SEEN_KEY } from './Assistant'
import { EXAMPLE_QUESTIONS, FALLBACK, findAnswer } from './assistantAnswers'

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

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
})
const aiReply = (answer: string, links: { to: string; label: string }[] = []) => json({ answer, links, source: 'ai' })

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: { code: 'http_error', message: '도우미 답변 기능이 설정되지 않았습니다.' } }, 503)))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(aiReply('월별 납입 계획에서 빠뜨린 달을 반영해 다시 계산해요.', [{ to: '/cashflow', label: '월별 납입 계획' }])))
    renderAssistant()
    await user.click(screen.getByRole('button', { name: '도우미에게 물어보기' }))

    await user.type(screen.getByRole('textbox'), '이번 달 납입을 빠뜨렸어요{Enter}')
    const answer = await screen.findByText(/빠뜨린 달을 반영/)
    expect(answer.closest('[role="status"]')).toHaveTextContent('AI가 쓴 답변이라 틀릴 수 있어요')
    await user.click(await screen.findByRole('button', { name: '월별 납입 계획' }))

    expect(screen.getByTestId('where')).toHaveTextContent('/cashflow')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('lists the sources an AI answer is based on, linking only web addresses', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({
      answer: '오늘 가계대출 금리가 올랐다는 소식이 있었어요.', links: [], source: 'ai',
      sources: [
        { title: '2026년 11월 2일 오늘 소식과 내 돈(빌린 돈(대출))', url: 'https://a.co.kr/1', publishedOn: '2026-11-02' },
        { title: '시장 지표 원/달러', url: '/market', publishedOn: null },
        { title: '옛 주소 기사', url: 'http://old-publisher.example/2', publishedOn: '2026-11-03' },
        { title: '위험한 주소', url: 'javascript:alert(1)', publishedOn: null },
      ],
    })))
    renderAssistant()
    await user.click(screen.getByRole('button', { name: '도우미에게 물어보기' }))
    await user.type(screen.getByRole('textbox'), '오늘 대출 뉴스 있었어?{Enter}')

    const sources = await screen.findByRole('list', { name: '답변 근거' })
    expect(within(sources).getByRole('link', { name: /오늘 소식과 내 돈/ })).toHaveAttribute('href', 'https://a.co.kr/1')
    expect(sources).toHaveTextContent('2026-11-02')
    expect(within(sources).getByRole('link', { name: /옛 주소 기사/ })).toHaveAttribute('href', 'http://old-publisher.example/2')
    expect(within(sources).queryByRole('link', { name: /위험한 주소/ })).not.toBeInTheDocument()
    expect(sources).toHaveTextContent('위험한 주소')
    await user.click(within(sources).getByRole('button', { name: '시장 지표 원/달러' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/market')
  })

  it('takes turns between idle poses, holds still for reduced motion, and naps when hidden', () => {
    vi.useFakeTimers()
    try {
      renderAssistant()
      const dog = () => document.querySelector('.assistant__dog img')?.getAttribute('src') ?? ''
      expect(dog()).toContain('moneydog.png')
      act(() => { vi.advanceTimersByTime(7_000) })
      expect(dog()).toContain('moneydog-glasses')
      act(() => { vi.advanceTimersByTime(7_000) })
      expect(dog()).toContain('moneydog-read')
      act(() => { vi.advanceTimersByTime(14_000) })
      expect(dog()).toContain('moneydog.png')  // back to the start after four poses
      cleanup()

      vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), addEventListener: () => undefined, removeEventListener: () => undefined }))
      renderAssistant()
      act(() => { vi.advanceTimersByTime(30_000) })
      expect(dog()).toContain('moneydog.png')
      cleanup()

      window.localStorage.setItem(ASSISTANT_HIDDEN_KEY, '1')
      renderAssistant()
      expect(screen.getByRole('button', { name: '도우미 다시 부르기' }).querySelector('img')?.getAttribute('src')).toContain('moneydog-rest')
    } finally {
      vi.useRealTimers()
    }
  })

  it('offers example questions that ask right away, and hides them once answered', async () => {
    const user = userEvent.setup()
    const fetch = vi.fn().mockResolvedValue(aiReply('다음 금통위는 2026년 11월 26일(목)이에요.'))
    vi.stubGlobal('fetch', fetch)
    renderAssistant()
    await user.click(screen.getByRole('button', { name: '도우미에게 물어보기' }))

    const examples = screen.getByLabelText('질문 예시')
    expect(within(examples).getAllByRole('button')).toHaveLength(5)
    await user.click(within(examples).getByRole('button', { name: '다음 금통위 언제야?' }))

    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({ message: '다음 금통위 언제야?', history: [] })
    expect(screen.getByRole('textbox')).toHaveValue('다음 금통위 언제야?')
    expect(await screen.findByText(/11월 26일/)).toBeInTheDocument()
    expect(screen.queryByLabelText('질문 예시')).not.toBeInTheDocument()
  })

  it('every example question has a built-in answer to fall back on', () => {
    for (const example of EXAMPLE_QUESTIONS) expect(findAnswer(example), example).not.toBe(FALLBACK)
  })

  it('shows the built-in answer when the AI answer did not pass the server checks', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({
      answer: '지금은 질문에 답하기 어려워요. 아래 화면에서 직접 확인해 보세요.', links: [{ to: '/about', label: '계산 기준' }], source: 'unavailable',
    })))
    renderAssistant()
    await user.click(screen.getByRole('button', { name: '도우미에게 물어보기' }))
    await user.click(within(screen.getByLabelText('질문 예시')).getByRole('button', { name: '적금 만기되면 목돈은 어디에 둬?' }))

    expect(await screen.findByText(findAnswer('적금 만기되면 목돈은 어디에 둬?').text)).toBeInTheDocument()
    expect(screen.getByText('질문과 딱 맞는 답은 찾지 못했어요. 비슷한 주제의 안내예요.')).toBeInTheDocument()  // it is not passed off as the answer
    expect(screen.queryByText(/답하기 어려워요/)).not.toBeInTheDocument()
  })

  it('sends the earlier turns with a follow-up and offers questions to ask next', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ answer: '서울에는 월세 지원 정책이 있어요.', links: [{ to: '/youth-policies', label: '청년정책 찾기' }], source: 'ai', suggestions: ['경기도는 어때?'] }))
      .mockResolvedValueOnce(json({ answer: '경기도에도 있어요.', links: [], source: 'ai' }))
    vi.stubGlobal('fetch', fetchMock)
    renderAssistant()
    await user.click(screen.getByRole('button', { name: '도우미에게 물어보기' }))
    await user.type(screen.getByRole('textbox'), '서울 월세 지원 정책 있어?')
    await user.click(screen.getByRole('button', { name: '찾기(S)' }))
    await screen.findByText('서울에는 월세 지원 정책이 있어요.')

    const first = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(first).toEqual({ message: '서울 월세 지원 정책 있어?', history: [] })

    await user.click(within(screen.getByLabelText('이어서 물어보기')).getByRole('button', { name: '경기도는 어때?' }))
    await screen.findByText('경기도에도 있어요.')
    const second = JSON.parse((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as string)
    expect(second.history).toEqual([
      { role: 'user', text: '서울 월세 지원 정책 있어?' },
      { role: 'assistant', text: '서울에는 월세 지원 정책이 있어요.' },
    ])
  })

  it('never recommends a product and says so', async () => {
    const user = userEvent.setup()
    renderAssistant()
    await user.click(screen.getByRole('button', { name: '도우미에게 물어보기' }))

    await user.type(screen.getByRole('textbox'), '어떤 적금을 추천해?')
    await user.click(screen.getByRole('button', { name: '찾기(S)' }))

    expect(screen.getByRole('status')).toHaveTextContent('추천하거나 가입을 권하지 않아요')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('falls back to the list of topics when nothing matches', async () => {
    const user = userEvent.setup()
    renderAssistant()
    await user.click(screen.getByRole('button', { name: '도우미에게 물어보기' }))

    await user.type(screen.getByRole('textbox'), '날씨 어때요{Enter}')

    const answer = await screen.findByText(/잘 모르겠어요/).then((node) => node.closest('[role="status"]') as HTMLElement)
    expect(answer).toHaveTextContent('잘 모르겠어요')
    expect(within(answer).getAllByRole('button')).toHaveLength(10)
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

describe('Assistant AI answers', () => {
  it('shows a thinking state, then the answer without AI notice for rule replies', async () => {
    const user = userEvent.setup()
    let release: (value: Response) => void = () => undefined
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>((resolve) => { release = resolve })))
    renderAssistant()
    await user.click(screen.getByRole('button', { name: '도우미에게 물어보기' }))

    await user.type(screen.getByRole('textbox'), '환율이 뭐예요{Enter}')
    expect(await screen.findByText('생각하는 중이에요…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '찾기(S)' })).toBeDisabled()
    const dog = () => document.querySelector('.assistant__dog img')?.getAttribute('src') ?? ''
    expect(dog()).toContain('moneydog-search')  // the magnifying glass while looking it up
    release(json({ answer: '지금은 질문에 답하기 어려워요.', links: [], source: 'rule' }))

    expect(await screen.findByText('지금은 질문에 답하기 어려워요.')).toBeInTheDocument()
    expect(dog()).toContain('moneydog-glasses')  // listening while the bubble is open
    expect(screen.queryByText(/AI가 쓴 답변/)).not.toBeInTheDocument()
  })

  it('tells the user when they ask too often and still shows the local answer', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: { code: 'http_error', message: '질문이 너무 많아요. 잠시 후 다시 물어봐 주세요.' } }, 429)))
    renderAssistant()
    await user.click(screen.getByRole('button', { name: '도우미에게 물어보기' }))

    await user.type(screen.getByRole('textbox'), '납입을 빠뜨렸어요{Enter}')

    expect(await screen.findByText('질문이 너무 많아요. 잠시 후 다시 물어봐 주세요.')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('빠뜨린 달을 반영')
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
    expect(findAnswer('적금 만기되면 목돈 어떻게 해?').links[0].to).toBe('/maturity')
    expect(findAnswer('나는 안정형인데').links[0].to).toBe('/maturity')
    expect(findAnswer('적금 깨고 싶어요').links[0].to).toBe('/cashflow')
    expect(findAnswer('요즘 물가 어때?').links[0].to).toBe('/market')
    expect(findAnswer('다음 금통위 언제야').links[0].to).toBe('/daily?tab=events')
    expect(findAnswer('').links.length).toBeGreaterThan(1)
  })
})
