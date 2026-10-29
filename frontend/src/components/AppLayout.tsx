import { useRef, useState, type PointerEvent as ReactPointerEvent, type PropsWithChildren } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import referenceSprite from '../assets/icons/reference-sprite.png'
import startLogo from '../assets/icons/start-logo.svg'

type IconKind = 'home' | 'conditions' | 'banks' | 'cashflow' | 'alternatives' | 'about'

interface DesktopApp {
  to: string
  label: string
  windowTitle: string
  icon: IconKind
}

const desktopApps: DesktopApp[] = [
  { to: '/', label: 'Very Rich?', windowTitle: 'Very Rich? - 시작', icon: 'home' },
  { to: '/conditions', label: '내 조건', windowTitle: '내 조건 입력', icon: 'conditions' },
  { to: '/banks', label: '은행 비교', windowTitle: '은행 비교 탐색기', icon: 'banks' },
  { to: '/cashflow', label: '납입 계획', windowTitle: '월별 납입 계획', icon: 'cashflow' },
  { to: '/alternatives', label: '대안 비교', windowTitle: '같은 돈, 다른 선택', icon: 'alternatives' },
  { to: '/about', label: '계산 기준', windowTitle: '계산 기준 및 출처', icon: 'about' },
]

const taskbarClock = new Intl.DateTimeFormat('ko-KR', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
}).format(new Date())

function getCurrentApp(pathname: string) {
  if (pathname.startsWith('/banks/')) {
    return { ...desktopApps[2], windowTitle: '은행 상세 정보' }
  }
  return desktopApps.find((app) => app.to === pathname) ?? desktopApps[0]
}

function PixelIcon({ kind, className = '' }: { kind: IconKind; className?: string }) {
  return (
    <span
      className={`pixel-icon pixel-icon--${kind} ${className}`.trim()}
      style={{ backgroundImage: `url(${referenceSprite})` }}
      aria-hidden="true"
    />
  )
}

function DesktopGlyph({ kind }: { kind: IconKind }) {
  return <PixelIcon kind={kind} className="desktop-glyph" />
}

export function AppLayout({ children }: PropsWithChildren) {
  const location = useLocation()
  const navigate = useNavigate()
  const currentApp = getCurrentApp(location.pathname)
  const [startOpen, setStartOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const [windowRect, setWindowRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const restoreRect = useRef<typeof windowRect>(null)
  const workspaceRef = useRef<HTMLElement>(null)
  const windowRef = useRef<HTMLElement>(null)
  const dragState = useRef<{ pointerId: number; startX: number; startY: number; left: number; top: number } | null>(null)

  function captureWindowRect() {
    const workspace = workspaceRef.current?.getBoundingClientRect()
    const window = windowRef.current?.getBoundingClientRect()
    if (!workspace || !window) return null
    return {
      x: window.left - workspace.left,
      y: window.top - workspace.top,
      width: window.width,
      height: window.height,
    }
  }

  function toggleMaximize() {
    if (maximized) {
      setMaximized(false)
      setWindowRect(restoreRect.current)
      return
    }
    restoreRect.current = captureWindowRect()
    setMaximized(true)
  }

  function startDragging(event: ReactPointerEvent<HTMLElement>) {
    if (maximized || event.button !== 0) return
    const current = captureWindowRect()
    if (!current) return
    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: current.x,
      top: current.y,
    }
    setWindowRect(current)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function dragWindow(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragState.current
    const workspace = workspaceRef.current
    const window = windowRef.current
    if (!drag || drag.pointerId !== event.pointerId || !workspace || !window) return
    const bounds = workspace.getBoundingClientRect()
    const size = window.getBoundingClientRect()
    const x = Math.min(Math.max(0, drag.left + event.clientX - drag.startX), Math.max(0, bounds.width - size.width))
    const y = Math.min(Math.max(0, drag.top + event.clientY - drag.startY), Math.max(0, bounds.height - size.height))
    setWindowRect({ x, y, width: size.width, height: size.height })
  }

  function stopDragging(event: ReactPointerEvent<HTMLElement>) {
    if (dragState.current?.pointerId === event.pointerId) dragState.current = null
  }

  return (
    <div className="retro-desktop">
      <main className="retro-workspace" ref={workspaceRef}>
        <nav className="desktop-icons" aria-label="바탕화면 바로가기">
          {desktopApps.map((app) => {
            const isActive = currentApp.to === app.to
            return (
              <Link
                className={`desktop-shortcut${isActive ? ' desktop-shortcut--active' : ''}`}
                key={app.to}
                to={app.to}
                aria-current={isActive ? 'page' : undefined}
              >
                <DesktopGlyph kind={app.icon} />
                <span className="desktop-shortcut__label">{app.label}</span>
              </Link>
            )
          })}
        </nav>

        {!minimized && <section
          className={`retro-window${maximized ? ' retro-window--maximized' : ''}`}
          aria-label={currentApp.windowTitle}
          ref={windowRef}
          style={!maximized && windowRect ? {
            position: 'absolute', left: windowRect.x, top: windowRect.y,
            width: windowRect.width, height: windowRect.height,
          } : undefined}
        >
          <header
            className="retro-window__titlebar"
            onPointerDown={startDragging}
            onPointerMove={dragWindow}
            onPointerUp={stopDragging}
            onPointerCancel={stopDragging}
            onDoubleClick={toggleMaximize}
          >
            <div className="retro-window__title">
              <PixelIcon kind={currentApp.icon} className="titlebar-app-icon" />
              <span>{currentApp.windowTitle}</span>
            </div>
            <div className="window-controls" aria-label="창 제어" onPointerDown={(event) => event.stopPropagation()}>
              <button className="window-control" type="button" aria-label="창 최소화" onClick={() => setMinimized(true)}>_</button>
              <button className="window-control" type="button" aria-label={maximized ? '창 복원' : '창 최대화'} onClick={toggleMaximize}>{maximized ? '❐' : '□'}</button>
              <button className="window-control" type="button" aria-label="창 닫기" onClick={() => navigate('/')}>×</button>
            </div>
          </header>
          <div className="retro-window__menubar" aria-hidden="true">
            <span>파일(F)</span>
            <span>보기(V)</span>
            <span>도움말(H)</span>
          </div>
          <div className="retro-window__body">{children}</div>
          <footer className="retro-window__statusbar">
            <span>준비</span>
            <span>Very Rich? OS</span>
          </footer>
          {!maximized && <span className="window-resize-hint" aria-hidden="true" />}
        </section>}
      </main>

      {startOpen && (
        <nav className="start-menu" aria-label="시작 메뉴">
          <div className="start-menu__rail">VERY RICH?</div>
          <div className="start-menu__items">
            {desktopApps.slice(1).map((app) => (
              <Link key={app.to} to={app.to} onClick={() => setStartOpen(false)}>
                <DesktopGlyph kind={app.icon} />
                <span>{app.label}</span>
              </Link>
            ))}
          </div>
        </nav>
      )}

      <footer className="taskbar">
        <button
          className={`start-button${startOpen ? ' start-button--pressed' : ''}`}
          type="button"
          aria-expanded={startOpen}
          onClick={() => setStartOpen((open) => !open)}
        >
          <img className="start-button__flag" src={startLogo} alt="" aria-hidden="true" />
          Start
        </button>
        <div className="taskbar-divider" aria-hidden="true" />
        <button className={`taskbar-app${minimized ? ' taskbar-app--minimized' : ''}`} type="button" aria-label={`현재 창: ${currentApp.windowTitle}`} onClick={() => setMinimized((value) => !value)}>
          <PixelIcon kind={currentApp.icon} className="titlebar-app-icon" />
          <span>{currentApp.windowTitle}</span>
        </button>
        <div className="taskbar-clock" aria-label={`현재 시각 ${taskbarClock}`}>{taskbarClock}</div>
      </footer>
    </div>
  )
}
