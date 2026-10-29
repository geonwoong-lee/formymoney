import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import './RetroUtilityApps.css'

export type UtilityId = 'folder' | 'notepad' | 'paint' | 'calculator' | 'minesweeper'

const utilityLabels: Record<UtilityId, string> = {
  folder: '내 폴더',
  notepad: '메모장',
  paint: '그림판',
  calculator: '계산기',
  minesweeper: '지뢰찾기',
}

function Glyph({ kind }: { kind: UtilityId }) {
  return <span className={`utility-glyph utility-glyph--${kind} folder-app__glyph`} aria-hidden="true" />
}

function FolderApp({ items, onOpen, onAdd, onRemove }: { items: UtilityId[]; onOpen: (id: UtilityId) => void; onAdd: (id: UtilityId) => void; onRemove: (id: UtilityId) => void }) {
  const available = (Object.keys(utilityLabels) as UtilityId[]).filter((id) => id !== 'folder' && !items.includes(id))
  const [selected, setSelected] = useState<UtilityId>('minesweeper')
  const effectiveSelected = available.includes(selected) ? selected : available[0]

  return (
    <div className="folder-app utility-app">
      <div className="utility-menubar"><span>파일</span><span>편집</span><span>보기</span><span>도움말</span></div>
      <div className="folder-toolbar"><button type="button" disabled>← 뒤로</button><label>주소 <input value="C:\\My Folder" readOnly /></label></div>
      <div className="folder-app__content">
        {items.length === 0 && <p className="folder-empty">폴더가 비어 있습니다. 아래에서 아이콘을 추가해 보세요.</p>}
        {items.map((id) => (
          <div className="folder-app__item" key={id}>
            <button type="button" className="folder-app__open" onDoubleClick={() => onOpen(id)} onClick={() => onOpen(id)}><Glyph kind={id} /><span>{utilityLabels[id]}</span></button>
            <button type="button" className="folder-app__remove" aria-label={`${utilityLabels[id]} 아이콘 빼기`} onClick={() => onRemove(id)}>×</button>
          </div>
        ))}
      </div>
      <div className="folder-manager">
        <span>아이콘 정리:</span>
        <select aria-label="추가할 아이콘" value={effectiveSelected ?? ''} onChange={(event) => setSelected(event.target.value as UtilityId)} disabled={available.length === 0}>
          {available.length === 0 ? <option value="">모두 추가됨</option> : available.map((id) => <option value={id} key={id}>{utilityLabels[id]}</option>)}
        </select>
        <button type="button" onClick={() => effectiveSelected && onAdd(effectiveSelected)} disabled={available.length === 0}>추가</button>
      </div>
      <div className="utility-statusbar">{items.length}개 개체</div>
    </div>
  )
}

function NotepadApp() {
  const [text, setText] = useState('Very Rich? 메모장\n\n오늘 확인할 금융 조건을 적어보세요.')
  return (
    <div className="notepad-app utility-app">
      <div className="utility-menubar"><button type="button" onClick={() => setText('')}>새로 만들기</button><span>편집</span><span>서식</span><span>도움말</span></div>
      <textarea aria-label="메모 내용" value={text} onChange={(event) => setText(event.target.value)} spellCheck="false" />
      <div className="utility-statusbar">{text.length}자 · 이 브라우저 창을 닫으면 초기화됩니다.</div>
    </div>
  )
}

const paintColors = ['#000000', '#808080', '#800000', '#ff0000', '#808000', '#ffff00', '#008000', '#00ff00', '#008080', '#00ffff', '#000080', '#0000ff', '#800080', '#ff00ff', '#ffffff']

function PaintApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)
  const [tool, setTool] = useState<'pencil' | 'eraser'>('pencil')
  const [color, setColor] = useState('#000000')

  function point(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const bounds = canvas.getBoundingClientRect()
    return { x: (event.clientX - bounds.left) * (canvas.width / bounds.width), y: (event.clientY - bounds.top) * (canvas.height / bounds.height) }
  }
  function begin(event: ReactPointerEvent<HTMLCanvasElement>) {
    drawing.current = true; lastPoint.current = point(event); event.currentTarget.setPointerCapture(event.pointerId)
  }
  function draw(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !lastPoint.current) return
    const canvas = canvasRef.current; const next = point(event); const context = canvas?.getContext('2d')
    if (!context) return
    context.beginPath(); context.moveTo(lastPoint.current.x, lastPoint.current.y); context.lineTo(next.x, next.y)
    context.strokeStyle = tool === 'eraser' ? '#ffffff' : color; context.lineWidth = tool === 'eraser' ? 20 : 4; context.lineCap = 'round'; context.stroke()
    lastPoint.current = next
  }
  function clear() {
    const canvas = canvasRef.current; const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height)
  }

  return (
    <div className="paint-app utility-app">
      <div className="utility-menubar"><span>파일</span><span>편집</span><span>보기</span><span>이미지</span><span>옵션</span><span>도움말</span></div>
      <div className="paint-workspace">
        <div className="paint-tools" aria-label="그림판 도구"><button className={tool === 'pencil' ? 'is-pressed' : ''} type="button" onClick={() => setTool('pencil')} aria-label="연필">✎</button><button className={tool === 'eraser' ? 'is-pressed' : ''} type="button" onClick={() => setTool('eraser')} aria-label="지우개">▱</button><button type="button" onClick={clear} aria-label="전체 지우기">□</button></div>
        <div className="paint-canvas-wrap"><canvas ref={canvasRef} width="900" height="520" aria-label="그림판 캔버스" onPointerDown={begin} onPointerMove={draw} onPointerUp={() => { drawing.current = false; lastPoint.current = null }} onPointerCancel={() => { drawing.current = false; lastPoint.current = null }} /></div>
      </div>
      <div className="paint-palette"><span className="paint-current-color" style={{ background: color }} />{paintColors.map((item) => <button type="button" key={item} aria-label={`${item} 색상`} style={{ background: item }} onClick={() => { setColor(item); setTool('pencil') }} />)}</div>
      <div className="utility-statusbar">연필로 그리고, 지우개나 전체 지우기를 사용할 수 있습니다.</div>
    </div>
  )
}

function CalculatorApp() {
  const [display, setDisplay] = useState('0')
  const [stored, setStored] = useState<number | null>(null)
  const [operation, setOperation] = useState<string | null>(null)
  const [replace, setReplace] = useState(true)
  function calculate(left: number, right: number, op: string) {
    if (op === '+') return left + right; if (op === '-') return left - right; if (op === '×') return left * right; if (op === '÷') return right === 0 ? NaN : left / right
    return right
  }
  function digit(value: string) {
    if (replace) { setDisplay(value); setReplace(false) } else setDisplay((current) => current === '0' ? value : `${current}${value}`)
  }
  function choose(next: string) {
    const current = Number(display)
    if (stored !== null && operation && !replace) { const result = calculate(stored, current, operation); setStored(result); setDisplay(Number.isFinite(result) ? String(result) : '오류') } else setStored(current)
    setOperation(next); setReplace(true)
  }
  function equals() {
    if (stored === null || !operation) return
    const result = calculate(stored, Number(display), operation); setDisplay(Number.isFinite(result) ? String(Number(result.toFixed(10))) : '오류'); setStored(null); setOperation(null); setReplace(true)
  }
  const keys = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '-', '0', '.', '=', '+']
  return (
    <div className="calculator-app utility-app">
      <div className="utility-menubar"><span>편집</span><span>보기</span><span>도움말</span></div>
      <output aria-label="계산기 표시창">{display}</output>
      <div className="calculator-actions"><button type="button" onClick={() => setDisplay((current) => current.length > 1 ? current.slice(0, -1) : '0')}>Backspace</button><button type="button" onClick={() => { setDisplay('0'); setReplace(true) }}>CE</button><button type="button" onClick={() => { setDisplay('0'); setStored(null); setOperation(null); setReplace(true) }}>C</button></div>
      <div className="calculator-grid">{keys.map((key) => <button type="button" key={key} onClick={() => { if (/\d/.test(key)) digit(key); else if (key === '.') { if (replace) { setDisplay('0.'); setReplace(false) } else if (!display.includes('.')) setDisplay(`${display}.`) } else if (key === '=') equals(); else choose(key) }}>{key}</button>)}</div>
    </div>
  )
}

interface MineCell { mine: boolean; revealed: boolean; flagged: boolean; nearby: number }
const mineIndexes = new Set([4, 11, 18, 25, 31, 46, 57, 63, 76, 79])
function makeBoard(): MineCell[] {
  return Array.from({ length: 81 }, (_, index) => {
    const row = Math.floor(index / 9); const col = index % 9; let nearby = 0
    for (let y = Math.max(0, row - 1); y <= Math.min(8, row + 1); y += 1) for (let x = Math.max(0, col - 1); x <= Math.min(8, col + 1); x += 1) if (mineIndexes.has(y * 9 + x)) nearby += 1
    return { mine: mineIndexes.has(index), revealed: false, flagged: false, nearby }
  })
}

function MinesweeperApp() {
  const [board, setBoard] = useState(makeBoard)
  const [status, setStatus] = useState<'ready' | 'playing' | 'won' | 'lost'>('ready')
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (status !== 'playing') return
    const timer = window.setInterval(() => setSeconds((value) => Math.min(999, value + 1)), 1000)
    return () => window.clearInterval(timer)
  }, [status])
  function reset() { setBoard(makeBoard()); setStatus('ready'); setSeconds(0) }
  function reveal(index: number) {
    if (status === 'lost' || status === 'won' || board[index].flagged) return
    const next = board.map((cell) => ({ ...cell })); const queue = [index]; const seen = new Set<number>()
    while (queue.length) {
      const current = queue.pop() as number
      if (seen.has(current)) continue; seen.add(current); next[current].revealed = true
      if (next[current].mine) { next.forEach((cell) => { if (cell.mine) cell.revealed = true }); setBoard(next); setStatus('lost'); return }
      if (next[current].nearby === 0) {
        const row = Math.floor(current / 9); const col = current % 9
        for (let y = Math.max(0, row - 1); y <= Math.min(8, row + 1); y += 1) for (let x = Math.max(0, col - 1); x <= Math.min(8, col + 1); x += 1) { const neighbor = y * 9 + x; if (!next[neighbor].flagged) queue.push(neighbor) }
      }
    }
    setBoard(next); setStatus(next.every((cell) => cell.mine || cell.revealed) ? 'won' : 'playing')
  }
  function flag(index: number) { if (status === 'lost' || status === 'won' || board[index].revealed) return; setStatus((value) => value === 'ready' ? 'playing' : value); setBoard((current) => current.map((cell, cellIndex) => cellIndex === index ? { ...cell, flagged: !cell.flagged } : cell)) }
  const flags = board.filter((cell) => cell.flagged).length
  return (
    <div className="minesweeper-app utility-app">
      <div className="utility-menubar"><button type="button" onClick={reset}>게임</button><span>도움말</span></div>
      <div className="mine-counter"><span>{String(Math.max(0, 10 - flags)).padStart(3, '0')}</span><button type="button" aria-label="새 게임" onClick={reset}>{status === 'lost' ? '☹' : status === 'won' ? '😎' : '☺'}</button><span>{String(seconds).padStart(3, '0')}</span></div>
      <div className="mine-board" role="grid" aria-label="9 곱하기 9 지뢰찾기 판">{board.map((cell, index) => <button type="button" role="gridcell" key={index} className={cell.revealed ? 'is-revealed' : ''} aria-label={`${Math.floor(index / 9) + 1}행 ${index % 9 + 1}열${cell.flagged ? ', 깃발' : ''}`} onClick={() => reveal(index)} onContextMenu={(event) => { event.preventDefault(); flag(index) }}>{cell.revealed ? cell.mine ? '✹' : cell.nearby || '' : cell.flagged ? '⚑' : ''}</button>)}</div>
      <div className="utility-statusbar">왼쪽 클릭: 열기 · 오른쪽 클릭: 깃발</div>
    </div>
  )
}

export function RetroUtilityApp({ kind, folderItems, onOpenUtility, onAddFolderItem, onRemoveFolderItem }: { kind: UtilityId; folderItems: UtilityId[]; onOpenUtility: (id: UtilityId) => void; onAddFolderItem: (id: UtilityId) => void; onRemoveFolderItem: (id: UtilityId) => void }) {
  if (kind === 'folder') return <FolderApp items={folderItems} onOpen={onOpenUtility} onAdd={onAddFolderItem} onRemove={onRemoveFolderItem} />
  if (kind === 'notepad') return <NotepadApp />
  if (kind === 'paint') return <PaintApp />
  if (kind === 'calculator') return <CalculatorApp />
  return <MinesweeperApp />
}
