import { useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, askAssistant } from '../api/client'
import dogGlassesImage from '../assets/icons/moneydog-glasses.png'
import dogImage from '../assets/icons/moneydog.png'
import dogReadImage from '../assets/icons/moneydog-read.png'
import dogRestImage from '../assets/icons/moneydog-rest.png'
import dogSearchImage from '../assets/icons/moneydog-search.png'
import dogSniffImage from '../assets/icons/moneydog-sniff.png'
import { EXAMPLE_QUESTIONS, FALLBACK, findAnswer, GREETING, type AssistantAnswer, type AssistantSource } from './assistantAnswers'
import './Assistant.css'

const INTERNAL_PATH = /^\/[a-z-]+$/

// A cited source opens our own page in place, a web article (https, or the http some publishers still use) in a new tab,
// and anything else is plain text.
function SourceLink({ source, onInternal }: { source: AssistantSource; onInternal: (to: string) => void }) {
  const url = source.url ?? ''
  if (INTERNAL_PATH.test(url)) {
    return <button type="button" className="assistant-bubble__source" onClick={() => onInternal(url)}>{source.title}</button>
  }
  if (/^https?:\/\//i.test(url)) {
    return <a href={url} target="_blank" rel="noreferrer">{source.title} ↗</a>
  }
  return <span>{source.title}</span>
}

export const ASSISTANT_HIDDEN_KEY = 'very-rich:assistant-hidden:v1'
export const ASSISTANT_SEEN_KEY = 'very-rich:assistant-seen:v1'

const HOME_LEFT = 14
const TASKBAR = 48
const DOG_WIDTH = 120
const DOG_HEIGHT = 100
const BUBBLE_WIDTH = 290
const DRAG_THRESHOLD = 4
// While nobody is talking to it the dog takes turns: holding a book, glasses on, reading, sniffing around.
const IDLE_POSES = [dogImage, dogGlassesImage, dogReadImage, dogSniffImage]
const POSE_SECONDS = 7

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    if (value) window.localStorage.setItem(key, '1')
    else window.localStorage.removeItem(key)
  } catch {
    // The helper still works for this visit when storage is unavailable.
  }
}

function clampOffset(x: number, y: number) {
  const maxX = Math.max(0, window.innerWidth - HOME_LEFT - DOG_WIDTH - 8)
  const minY = -Math.max(0, window.innerHeight - TASKBAR - DOG_HEIGHT - 8)
  return { x: Math.min(Math.max(-HOME_LEFT + 4, x), maxX), y: Math.min(Math.max(minY, y), 0) }
}

export function Assistant({ greetOnFirstVisit = false }: { greetOnFirstVisit?: boolean }) {
  const navigate = useNavigate()
  const [hidden, setHidden] = useState(() => readFlag(ASSISTANT_HIDDEN_KEY))
  const [open, setOpen] = useState(() => greetOnFirstVisit && !readFlag(ASSISTANT_SEEN_KEY) && !readFlag(ASSISTANT_HIDDEN_KEY))
  const [query, setQuery] = useState('')
  const [answer, setAnswer] = useState<AssistantAnswer | null>(null)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [happy, setHappy] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [pose, setPose] = useState(0)
  const requestId = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const drag = useRef<{ pointerId: number; startX: number; startY: number; baseX: number; baseY: number; moved: boolean } | null>(null)
  const justDragged = useRef(false)

  useEffect(() => {
    // Listening or thinking poses take over; people who asked for less motion get one still pose.
    if (open || thinking || prefersReducedMotion()) return
    const timer = window.setInterval(() => setPose((current) => (current + 1) % IDLE_POSES.length), POSE_SECONDS * 1000)
    return () => window.clearInterval(timer)
  }, [open, thinking])

  useEffect(() => {
    if (open) {
      writeFlag(ASSISTANT_SEEN_KEY, true)
      inputRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') { setOpen(false); setOptionsOpen(false) }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open])

  useEffect(() => {
    if (!happy) return
    const timer = window.setTimeout(() => setHappy(false), 900)
    return () => window.clearTimeout(timer)
  }, [happy])

  useEffect(() => {
    function keepInside() { setOffset((current) => clampOffset(current.x, current.y)) }
    window.addEventListener('resize', keepInside)
    return () => window.removeEventListener('resize', keepInside)
  }, [])

  function hide() {
    writeFlag(ASSISTANT_HIDDEN_KEY, true)
    setHidden(true)
    setOpen(false)
    setOptionsOpen(false)
  }

  function show() {
    writeFlag(ASSISTANT_HIDDEN_KEY, false)
    setHidden(false)
    setOpen(true)
  }

  async function search(event?: FormEvent, asked?: string) {
    event?.preventDefault()
    setOptionsOpen(false)
    const question = (asked ?? query).trim()
    const fallback = findAnswer(question)
    if (!question || fallback.recommendation) {
      setAnswer(fallback)
      setHappy(true)
      return
    }
    const current = ++requestId.current
    setThinking(true)
    setAnswer(null)
    try {
      const reply = await askAssistant(question)
      if (current !== requestId.current) return
      // When the AI answer did not pass the server's checks, the built-in answer for the topic beats "can't answer".
      if (reply.source === 'unavailable' && fallback !== FALLBACK) setAnswer(fallback)
      else setAnswer({ text: reply.answer, links: reply.links, ai: reply.source === 'ai', sources: reply.sources ?? [] })
    } catch (cause) {
      if (current !== requestId.current) return
      const busy = cause instanceof ApiError && cause.status === 429
      setAnswer({ ...fallback, notice: busy ? cause.message : undefined })
    } finally {
      if (current === requestId.current) {
        setThinking(false)
        setHappy(true)
      }
    }
  }

  function go(to: string) {
    navigate(to)
    setOpen(false)
    setAnswer(null)
    setQuery('')
  }

  function startDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, baseX: offset.x, baseY: offset.y, moved: false }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function moveDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const state = drag.current
    if (!state || state.pointerId !== event.pointerId) return
    const dx = event.clientX - state.startX
    const dy = event.clientY - state.startY
    if (!state.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    state.moved = true
    setOffset(clampOffset(state.baseX + dx, state.baseY + dy))
  }

  function endDrag() {
    justDragged.current = drag.current?.moved ?? false
    drag.current = null
  }

  function toggleBubble() {
    if (justDragged.current) { justDragged.current = false; return }
    setOpen((current) => !current)
  }

  if (hidden) {
    return <button className="assistant-recall" type="button" onClick={show} aria-label="도우미 다시 부르기" title="도우미 다시 부르기">
      <img src={dogRestImage} alt="" aria-hidden="true" />
    </button>
  }

  const bubbleOnRight = HOME_LEFT + offset.x + BUBBLE_WIDTH > window.innerWidth - 12

  return <aside className={`assistant${bubbleOnRight ? ' assistant--flip' : ''}`} aria-label="도우미 머니독" style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}>
    {open && <div className="assistant-bubble" role="dialog" aria-label="도우미 말풍선">
      <form onSubmit={search}>
        <label className="assistant-bubble__title" htmlFor="assistant-query">{GREETING}</label>
        <input
          id="assistant-query" ref={inputRef} className="assistant-bubble__input" type="text" value={query} autoComplete="off"
          maxLength={80} onChange={(event) => setQuery(event.target.value)}
        />
        <div className="assistant-bubble__buttons">
          <button type="button" onClick={() => setOptionsOpen((current) => !current)} aria-expanded={optionsOpen}>옵션(O)</button>
          <button type="submit" disabled={thinking}>찾기(S)</button>
        </div>
      </form>
      {optionsOpen && <div className="assistant-bubble__options" role="menu">
        <button type="button" role="menuitem" onClick={hide}>도우미 숨기기</button>
        <button type="button" role="menuitem" onClick={() => { setOpen(false); setOptionsOpen(false) }}>말풍선 닫기</button>
      </div>}
      {!answer && !thinking && <div className="assistant-bubble__examples" aria-label="질문 예시">
        <span>이렇게 물어보세요</span>
        {EXAMPLE_QUESTIONS.map((example) => <button type="button" key={example} onClick={() => { setQuery(example); void search(undefined, example) }}>{example}</button>)}
      </div>}
      {thinking && <p className="assistant-bubble__thinking" role="status">생각하는 중이에요…</p>}
      {answer && <div className="assistant-bubble__answer" role="status">
        {answer.notice && <p className="assistant-bubble__notice">{answer.notice}</p>}
        <p>{answer.text}</p>
        {answer.sources && answer.sources.length > 0 && <div className="assistant-bubble__sources">
          <b>근거</b>
          <ul aria-label="답변 근거">
            {answer.sources.map((source, index) => <li key={index}>
              <SourceLink source={source} onInternal={go} />
              {source.publishedOn && <span> · {source.publishedOn}</span>}
            </li>)}
          </ul>
        </div>}
        {answer.ai && <p className="assistant-bubble__ai">AI가 쓴 답변이라 틀릴 수 있어요. 정확한 내용은 공식 자료로 확인하세요.</p>}
        <div className="assistant-bubble__links">
          {answer.links.map((link) => <button type="button" key={link.to} onClick={() => go(link.to)}>{link.label}</button>)}
        </div>
      </div>}
      <span className="assistant-bubble__tail" aria-hidden="true" />
    </div>}
    <button
      className={`assistant__dog${happy ? ' assistant__dog--happy' : ''}${open ? ' assistant__dog--listening' : ''}`}
      type="button" onClick={toggleBubble} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
      aria-expanded={open} aria-label={open ? '도우미 말풍선 닫기' : '도우미에게 물어보기'} title="클릭하면 말풍선, 끌면 위치 이동"
    >
      {/* While an answer is being looked up the dog holds a magnifying glass instead of its book. */}
      <img src={thinking ? dogSearchImage : open ? dogGlassesImage : IDLE_POSES[pose]} alt="" aria-hidden="true" draggable={false} />
    </button>
  </aside>
}
