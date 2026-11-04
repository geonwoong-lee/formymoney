import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import './StickyNote.css'

const CLOSED_KEY = 'very-rich:sticky-note-closed:v1'

// The path a first-time visitor can follow, in the order the screens build on each other.
const JOURNEY = [
  { to: '/conditions', label: '내 조건', hint: '받을 우대 조건 체크' },
  { to: '/banks', label: '은행 비교', hint: '내 조건 만기액 비교' },
  { to: '/my-savings', label: '내 적금', hint: '가입한 적금 기록·알림' },
  { to: '/cashflow', label: '납입 계획', hint: '달마다 넣은 돈 확인' },
  { to: '/maturity', label: '만기 후 계획', hint: '만기 돈 쓸 곳 고르기' },
] as const

function wasClosed(): boolean {
  try {
    return window.localStorage.getItem(CLOSED_KEY) === '1'
  } catch {
    return false
  }
}

function remember(closed: boolean) {
  try {
    if (closed) window.localStorage.setItem(CLOSED_KEY, '1')
    else window.localStorage.removeItem(CLOSED_KEY)
  } catch {
    // The note still works for this visit when the browser will not store anything.
  }
}

// A post-it stuck on the desktop: the usual order of the screens for someone who has just arrived.
// Closing it leaves a small stub that opens it again.
export function StickyNote() {
  const [closed, setClosed] = useState(wasClosed)
  const { pathname } = useLocation()
  const change = (next: boolean) => { setClosed(next); remember(next) }

  if (closed) {
    return <button type="button" className="sticky-stub" onClick={() => change(false)} aria-label="처음 오셨나요? 이용 순서 메모 열기">
      <span aria-hidden="true">메모</span>
    </button>
  }
  return <aside className="sticky-note" aria-label="처음 오셨나요? 이용 순서">
    <header className="sticky-note__bar">
      <span>처음 오셨나요? 이 순서로 둘러보세요 (모르는 건 강아지 머니독에게)</span>
      <button type="button" onClick={() => change(true)} aria-label="이용 순서 메모 닫기">×</button>
    </header>
    <ol className="sticky-note__steps">
      {JOURNEY.map((step) => <li key={step.to}>
        <Link to={step.to} aria-current={pathname === step.to ? 'page' : undefined}>
          <b>{step.label}</b>
          <small>{step.hint}</small>
        </Link>
      </li>)}
    </ol>
  </aside>
}
