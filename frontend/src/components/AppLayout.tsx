import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type PropsWithChildren } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import dashboardSprite from '../assets/icons/dashboard-sprite-v2.png'
import startLogo from '../assets/icons/start-logo.svg'
import { RetroUtilityApp, type UtilityId } from './RetroUtilityApps'

type IconKind = 'home' | 'conditions' | 'banks' | 'cashflow' | 'alternatives' | 'about'
interface DesktopApp { to: string; label: string; windowTitle: string; icon: IconKind }
interface UtilityAppDefinition { id: UtilityId; label: string; windowTitle: string }
interface Rect { x: number; y: number; width: number; height: number }

const desktopApps: DesktopApp[] = [
  { to: '/', label: 'Very Rich?', windowTitle: 'Very Rich? - 시작', icon: 'home' },
  { to: '/conditions', label: '내 조건', windowTitle: '내 조건 입력', icon: 'conditions' },
  { to: '/banks', label: '은행 비교', windowTitle: '은행 비교 탐색기', icon: 'banks' },
  { to: '/cashflow', label: '납입 계획', windowTitle: '월별 납입 계획', icon: 'cashflow' },
  { to: '/alternatives', label: '대안 비교', windowTitle: '같은 돈, 다른 선택', icon: 'alternatives' },
  { to: '/about', label: '계산 기준', windowTitle: '계산 기준 및 출처', icon: 'about' },
]

const utilityApps: UtilityAppDefinition[] = [
  { id: 'folder', label: '내 폴더', windowTitle: '내 폴더' },
  { id: 'notepad', label: '메모장', windowTitle: '제목 없음 - 메모장' },
  { id: 'paint', label: '그림판', windowTitle: '제목 없음 - 그림판' },
  { id: 'calculator', label: '계산기', windowTitle: '계산기' },
  { id: 'minesweeper', label: '지뢰찾기', windowTitle: '지뢰찾기' },
]

function getCurrentApp(pathname: string) {
  if (pathname.startsWith('/banks/')) return { ...desktopApps[2], windowTitle: '은행 상세 정보' }
  return desktopApps.find((app) => app.to === pathname) ?? desktopApps[0]
}

function PixelIcon({ kind, className = '' }: { kind: IconKind; className?: string }) {
  return <span className={`pixel-icon pixel-icon--${kind} ${className}`.trim()} style={{ backgroundImage: `url(${dashboardSprite})` }} aria-hidden="true" />
}

function UtilityGlyph({ kind, className = '' }: { kind: UtilityId; className?: string }) {
  return <span className={`utility-glyph utility-glyph--${kind} ${className}`.trim()} aria-hidden="true" />
}

function WindowControls({ maximized, onMinimize, onMaximize, onClose }: { maximized: boolean; onMinimize: () => void; onMaximize: () => void; onClose: () => void }) {
  return (
    <div className="window-controls" aria-label="창 제어" onPointerDown={(event) => event.stopPropagation()}>
      <button className="window-control" type="button" aria-label="창 최소화" onClick={onMinimize}>_</button>
      <button className="window-control" type="button" aria-label={maximized ? '창 복원' : '창 최대화'} onClick={onMaximize}>{maximized ? '❐' : '□'}</button>
      <button className="window-control" type="button" aria-label="창 닫기" onClick={onClose}>×</button>
    </div>
  )
}

function UtilityWindow({ app, index, active, minimized, onFocus, onMinimize, onClose, onOpenUtility, folderItems, onAddFolderItem, onRemoveFolderItem }: {
  app: UtilityAppDefinition; index: number; active: boolean; minimized: boolean; onFocus: () => void; onMinimize: () => void; onClose: () => void
  onOpenUtility: (id: UtilityId) => void; folderItems: UtilityId[]; onAddFolderItem: (id: UtilityId) => void; onRemoveFolderItem: (id: UtilityId) => void
}) {
  const windowRef = useRef<HTMLElement>(null)
  const dragState = useRef<{ pointerId: number; startX: number; startY: number; left: number; top: number } | null>(null)
  const restoreRect = useRef<Rect | null>(null)
  const [maximized, setMaximized] = useState(false)
  const [rect, setRect] = useState<Rect>({
    x: 154 + (index % 4) * 34,
    y: 54 + (index % 4) * 30,
    width: app.id === 'calculator' ? 310 : app.id === 'minesweeper' ? 350 : 620,
    height: app.id === 'calculator' ? 390 : app.id === 'minesweeper' ? 520 : 560,
  })

  function captureRect() {
    const workspace = windowRef.current?.parentElement?.parentElement?.getBoundingClientRect()
    const current = windowRef.current?.getBoundingClientRect()
    if (!workspace || !current) return rect
    return { x: current.left - workspace.left, y: current.top - workspace.top, width: current.width, height: current.height }
  }

  function toggleMaximize() {
    onFocus()
    if (maximized) {
      setMaximized(false)
      if (restoreRect.current) setRect(restoreRect.current)
    } else {
      restoreRect.current = captureRect()
      setMaximized(true)
    }
  }

  function startDragging(event: ReactPointerEvent<HTMLElement>) {
    onFocus()
    if (maximized || event.button !== 0) return
    const current = captureRect()
    dragState.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, left: current.x, top: current.y }
    setRect(current)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function dragWindow(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragState.current
    const workspace = windowRef.current?.parentElement?.parentElement?.getBoundingClientRect()
    const current = windowRef.current?.getBoundingClientRect()
    if (!drag || drag.pointerId !== event.pointerId || !workspace || !current) return
    const x = Math.min(Math.max(0, drag.left + event.clientX - drag.startX), Math.max(0, workspace.width - current.width))
    const y = Math.min(Math.max(0, drag.top + event.clientY - drag.startY), Math.max(0, workspace.height - current.height))
    setRect({ x, y, width: current.width, height: current.height })
  }

  if (minimized) return null
  return (
    <section className={`retro-window utility-window${maximized ? ' retro-window--maximized' : ''}${active ? '' : ' retro-window--inactive'}`} aria-label={app.windowTitle} ref={windowRef} onPointerDown={onFocus} style={maximized ? undefined : { left: rect.x, top: rect.y, width: rect.width, height: rect.height }}>
      <header className="retro-window__titlebar" onPointerDown={startDragging} onPointerMove={dragWindow} onPointerUp={() => { dragState.current = null }} onPointerCancel={() => { dragState.current = null }} onDoubleClick={toggleMaximize}>
        <div className="retro-window__title"><UtilityGlyph kind={app.id} className="titlebar-utility-icon" /><span>{app.windowTitle}</span></div>
        <WindowControls maximized={maximized} onMinimize={onMinimize} onMaximize={toggleMaximize} onClose={onClose} />
      </header>
      <RetroUtilityApp kind={app.id} folderItems={folderItems} onOpenUtility={onOpenUtility} onAddFolderItem={onAddFolderItem} onRemoveFolderItem={onRemoveFolderItem} />
      {!maximized && <span className="window-resize-hint" aria-hidden="true" />}
    </section>
  )
}

export function AppLayout({ children }: PropsWithChildren) {
  const location = useLocation()
  const navigate = useNavigate()
  const currentApp = getCurrentApp(location.pathname)
  const [startOpen, setStartOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const [windowRect, setWindowRect] = useState<Rect | null>(null)
  const [openUtilities, setOpenUtilities] = useState<UtilityId[]>([])
  const [minimizedUtilities, setMinimizedUtilities] = useState<UtilityId[]>([])
  const [folderItems, setFolderItems] = useState<UtilityId[]>(['notepad', 'paint', 'calculator', 'minesweeper'])
  const [zOrder, setZOrder] = useState<string[]>(['main'])
  const [now, setNow] = useState(() => new Date())
  const [selection, setSelection] = useState<{ startX: number; startY: number; x: number; y: number; width: number; height: number } | null>(null)
  const restoreRect = useRef<typeof windowRect>(null)
  const workspaceRef = useRef<HTMLElement>(null)
  const windowRef = useRef<HTMLElement>(null)
  const dragState = useRef<{ pointerId: number; startX: number; startY: number; left: number; top: number } | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  function focusWindow(id: string) { setZOrder((current) => [...current.filter((item) => item !== id), id]) }
  function openUtility(id: UtilityId) {
    setOpenUtilities((current) => current.includes(id) ? current : [...current, id])
    setMinimizedUtilities((current) => current.filter((item) => item !== id))
    focusWindow(id)
    setStartOpen(false)
  }
  function closeUtility(id: UtilityId) {
    setOpenUtilities((current) => current.filter((item) => item !== id))
    setMinimizedUtilities((current) => current.filter((item) => item !== id))
    setZOrder((current) => current.filter((item) => item !== id))
  }
  function toggleUtilityFromTaskbar(id: UtilityId) {
    const isMinimized = minimizedUtilities.includes(id)
    const isActive = zOrder.at(-1) === id
    if (!isMinimized && isActive) setMinimizedUtilities((current) => [...current, id])
    else { setMinimizedUtilities((current) => current.filter((item) => item !== id)); focusWindow(id) }
  }
  function captureWindowRect() {
    const workspace = workspaceRef.current?.getBoundingClientRect()
    const windowElement = windowRef.current?.getBoundingClientRect()
    if (!workspace || !windowElement) return null
    return { x: windowElement.left - workspace.left, y: windowElement.top - workspace.top, width: windowElement.width, height: windowElement.height }
  }
  function toggleMaximize() {
    focusWindow('main')
    if (maximized) { setMaximized(false); setWindowRect(restoreRect.current); return }
    restoreRect.current = captureWindowRect(); setMaximized(true)
  }
  function startDragging(event: ReactPointerEvent<HTMLElement>) {
    focusWindow('main')
    if (maximized || event.button !== 0) return
    const current = captureWindowRect()
    if (!current) return
    dragState.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, left: current.x, top: current.y }
    setWindowRect(current); event.currentTarget.setPointerCapture(event.pointerId)
  }
  function dragWindow(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragState.current
    const workspace = workspaceRef.current?.getBoundingClientRect()
    const windowElement = windowRef.current?.getBoundingClientRect()
    if (!drag || drag.pointerId !== event.pointerId || !workspace || !windowElement) return
    const x = Math.min(Math.max(0, drag.left + event.clientX - drag.startX), Math.max(0, workspace.width - windowElement.width))
    const y = Math.min(Math.max(0, drag.top + event.clientY - drag.startY), Math.max(0, workspace.height - windowElement.height))
    setWindowRect({ x, y, width: windowElement.width, height: windowElement.height })
  }
  function startSelection(event: ReactPointerEvent<HTMLElement>) {
    if (event.target !== event.currentTarget || event.button !== 0) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - bounds.left; const y = event.clientY - bounds.top
    setSelection({ startX: x, startY: y, x, y, width: 0, height: 0 })
    event.currentTarget.setPointerCapture(event.pointerId); setStartOpen(false)
  }
  function moveSelection(event: ReactPointerEvent<HTMLElement>) {
    if (!selection) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const currentX = Math.min(Math.max(0, event.clientX - bounds.left), bounds.width)
    const currentY = Math.min(Math.max(0, event.clientY - bounds.top), bounds.height)
    setSelection((current) => current && ({ ...current, x: Math.min(current.startX, currentX), y: Math.min(current.startY, currentY), width: Math.abs(currentX - current.startX), height: Math.abs(currentY - current.startY) }))
  }

  const dateLabel = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const timeLabel = new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: true }).format(now)
  const activeWindow = zOrder.at(-1)

  return (
    <div className="retro-desktop">
      <main className="retro-workspace" ref={workspaceRef} onPointerDown={startSelection} onPointerMove={moveSelection} onPointerUp={() => window.setTimeout(() => setSelection(null), 90)} onPointerCancel={() => setSelection(null)}>
        <nav className="desktop-icons" aria-label="바탕화면 바로가기">
          {desktopApps.map((app) => {
            const isActive = currentApp.to === app.to
            return <Link className={`desktop-shortcut${isActive ? ' desktop-shortcut--active' : ''}`} key={app.to} to={app.to} onClick={() => { setMinimized(false); focusWindow('main') }} aria-current={isActive ? 'page' : undefined}><PixelIcon kind={app.icon} className="desktop-glyph" /><span className="desktop-shortcut__label">{app.label}</span></Link>
          })}
          {utilityApps.filter((app) => app.id === 'folder').map((app) => <button className="desktop-shortcut desktop-shortcut--button" type="button" key={app.id} onClick={() => openUtility(app.id)}><UtilityGlyph kind={app.id} className="desktop-glyph" /><span className="desktop-shortcut__label">{app.label}</span></button>)}
        </nav>
        {selection && <span className="desktop-selection" style={{ left: selection.x, top: selection.y, width: selection.width, height: selection.height }} aria-hidden="true" />}

        {!minimized && <section className={`retro-window main-window${maximized ? ' retro-window--maximized' : ''}${activeWindow === 'main' ? '' : ' retro-window--inactive'}`} aria-label={currentApp.windowTitle} ref={windowRef} onPointerDown={() => focusWindow('main')} style={{ zIndex: 10 + zOrder.indexOf('main'), ...(!maximized && windowRect ? { left: windowRect.x, top: windowRect.y, width: windowRect.width, height: windowRect.height } : {}) }}>
          <header className="retro-window__titlebar" onPointerDown={startDragging} onPointerMove={dragWindow} onPointerUp={() => { dragState.current = null }} onPointerCancel={() => { dragState.current = null }} onDoubleClick={toggleMaximize}>
            <div className="retro-window__title"><PixelIcon kind={currentApp.icon} className="titlebar-app-icon" /><span>{currentApp.windowTitle}</span></div>
            <WindowControls maximized={maximized} onMinimize={() => setMinimized(true)} onMaximize={toggleMaximize} onClose={() => navigate('/')} />
          </header>
          <div className="retro-window__menubar" aria-hidden="true"><span>파일(F)</span><span>편집(E)</span><span>보기(V)</span><span>도움말(H)</span></div>
          <nav className="retro-window__toolbar" aria-label="창 탐색"><button type="button" aria-label="뒤로 가기" onClick={() => navigate(-1)}>←</button><button type="button" aria-label="앞으로 가기" onClick={() => navigate(1)}>→</button><span aria-label="현재 위치">주소　Very Rich? \ {currentApp.windowTitle}</span></nav>
          <div className="retro-window__body">{children}</div>
          <footer className="retro-window__statusbar"><span>준비</span><span>Very Rich? OS</span></footer>
          {!maximized && <span className="window-resize-hint" aria-hidden="true" />}
        </section>}

        {openUtilities.map((id, index) => {
          const app = utilityApps.find((item) => item.id === id)
          if (!app) return null
          return <div className="utility-window-layer" key={id} style={{ zIndex: 10 + zOrder.indexOf(id) }}><UtilityWindow app={app} index={index} active={activeWindow === id} minimized={minimizedUtilities.includes(id)} onFocus={() => focusWindow(id)} onMinimize={() => setMinimizedUtilities((current) => current.includes(id) ? current : [...current, id])} onClose={() => closeUtility(id)} onOpenUtility={openUtility} folderItems={folderItems} onAddFolderItem={(item) => setFolderItems((current) => current.includes(item) ? current : [...current, item])} onRemoveFolderItem={(item) => setFolderItems((current) => current.filter((entry) => entry !== item))} /></div>
        })}
      </main>

      {startOpen && <nav className="start-menu" aria-label="시작 메뉴"><div className="start-menu__rail">VERY RICH? 98</div><div className="start-menu__items">
        {desktopApps.slice(1).map((app) => <Link key={app.to} to={app.to} onClick={() => { setStartOpen(false); setMinimized(false); focusWindow('main') }}><PixelIcon kind={app.icon} className="desktop-glyph" /><span>{app.label}</span></Link>)}
        <div className="start-menu__separator" />
        {utilityApps.filter((app) => app.id === 'folder').map((app) => <button type="button" key={app.id} onClick={() => openUtility(app.id)}><UtilityGlyph kind={app.id} /><span>{app.label}</span></button>)}
      </div></nav>}

      <footer className="taskbar">
        <button className={`start-button${startOpen ? ' start-button--pressed' : ''}`} type="button" aria-expanded={startOpen} onClick={() => setStartOpen((open) => !open)}><img className="start-button__flag" src={startLogo} alt="" aria-hidden="true" />Start</button>
        <div className="taskbar-divider" aria-hidden="true" />
        <div className="taskbar-windows" aria-label="열린 창">
          <button className={`taskbar-app${minimized ? ' taskbar-app--minimized' : ''}${activeWindow === 'main' && !minimized ? ' taskbar-app--active' : ''}`} type="button" aria-label={`현재 창: ${currentApp.windowTitle}`} onClick={() => { if (!minimized && activeWindow === 'main') setMinimized(true); else { setMinimized(false); focusWindow('main') } }}><PixelIcon kind={currentApp.icon} className="titlebar-app-icon" /><span>{currentApp.windowTitle}</span></button>
          {openUtilities.map((id) => { const app = utilityApps.find((item) => item.id === id); return app && <button className={`taskbar-app${minimizedUtilities.includes(id) ? ' taskbar-app--minimized' : ''}${activeWindow === id && !minimizedUtilities.includes(id) ? ' taskbar-app--active' : ''}`} type="button" key={id} aria-label={`열린 창: ${app.windowTitle}`} onClick={() => toggleUtilityFromTaskbar(id)}><UtilityGlyph kind={id} className="titlebar-utility-icon" /><span>{app.windowTitle}</span></button> })}
        </div>
        <div className="taskbar-clock" aria-label={`현재 날짜 ${dateLabel}, 현재 시각 ${timeLabel}`}><span>{dateLabel}</span><strong>{timeLabel}</strong></div>
      </footer>
    </div>
  )
}
