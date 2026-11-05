import { Component, type ErrorInfo, type ReactNode } from 'react'

const RELOADED_AT_KEY = 'very-rich:chunk-reload-at:v1'
// Long enough that a screen that keeps failing never reloads the page in a loop; a later release can still trigger one.
const RELOAD_GAP_MS = 10 * 60_000

function looksLikeMissingScreen(error: Error): boolean {
  return /dynamically imported module|Importing a module script failed|Failed to fetch dynamically|error loading dynamically|Loading chunk/i.test(error.message)
}

// After a new release the page the visitor still has open asks for screen files that no longer exist. Reload once to pick up the new
// release; if it still fails (or the network is down), say so and offer the button instead of leaving a blank window.
function reloadOnce(): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(RELOADED_AT_KEY) ?? 0)
    if (Date.now() - last < RELOAD_GAP_MS) return false
    window.sessionStorage.setItem(RELOADED_AT_KEY, String(Date.now()))
  } catch {
    return false
  }
  window.location.reload()
  return true
}

interface Props { children: ReactNode }
interface State { failed: boolean }

export class ScreenBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    if (looksLikeMissingScreen(error)) reloadOnce()
  }

  render() {
    if (!this.state.failed) return this.props.children
    return <section className="page" role="alert">
      <p className="eyebrow">Error</p>
      <h1>화면을 불러오지 못했어요</h1>
      <p className="lead">인터넷 연결이 끊겼거나 서비스가 새 버전으로 바뀌었을 수 있어요. 새로 고치면 대부분 해결돼요. 입력한 내용은 이 브라우저에 남아 있어요.</p>
      <p><button type="button" className="button" onClick={() => window.location.reload()}>새로 고침</button></p>
    </section>
  }
}
