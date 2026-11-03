import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, deleteAccountWatchlist, getAccountWatchlist, putAccountWatchlist } from '../api/client'
import { loadWatchlist, mergeWatchlists, replaceWatchlist, type WatchedProduct } from '../features/watchlist'
import { loadAuthSession } from '../storage/authStorage'

const KIND = { deposit: '예금', saving: '적금' } as const

// The starred products on this device, with the choice to keep them on the account and load them on another device.
// Nothing leaves the device until a button here is pressed.
export function MyWatchlist() {
  const [items, setItems] = useState(loadWatchlist)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [session] = useState(loadAuthSession)

  function remove(item: WatchedProduct) {
    setItems((current) => replaceWatchlist(current.filter((other) => !(other.kind === item.kind && other.company === item.company && other.productCode === item.productCode))))
  }

  async function run(action: (token: string) => Promise<string>) {
    if (!session) return
    setBusy(true)
    try {
      setNote(await action(session.accessToken))
    } catch (cause) {
      setNote(cause instanceof ApiError && cause.status === 401 ? '로그인이 끝났어요. 다시 로그인해 주세요.' : cause instanceof Error ? cause.message : '처리하지 못했어요.')
    } finally {
      setBusy(false)
    }
  }

  const saveToAccount = () => run(async (token) => {
    const saved = await putAccountWatchlist(token, items)
    return `관심 상품 ${saved.items.length}개를 내 계정에 저장했어요.`
  })

  const loadFromAccount = () => run(async (token) => {
    const remote = await getAccountWatchlist(token)
    const merged = replaceWatchlist(mergeWatchlists(items, remote.items))
    setItems(merged)
    return remote.items.length === 0 ? '계정에 저장된 관심 상품이 없어요.' : `계정의 관심 상품을 불러와 이 기기 것과 합쳤어요(${merged.length}개).`
  })

  const clearAccount = () => run(async (token) => {
    await deleteAccountWatchlist(token)
    return '계정에 저장한 관심 상품을 지웠어요. 이 기기의 목록은 그대로예요.'
  })

  return <section className="my-savings__card" aria-labelledby="my-savings-watch">
    <h2 id="my-savings-watch">관심 상품</h2>
    {items.length === 0
      ? <p className="my-savings__muted">☆를 누른 상품이 없어요. <Link to="/general-savings">일반 적금 비교</Link>나 <Link to="/maturity">만기 후 계획</Link>에서 상품 옆 ☆를 눌러 두면 금리가 바뀔 때 알려 드려요.</p>
      : <ul className="my-savings__watch">
        {items.map((item) => <li key={`${item.kind}-${item.company}-${item.productCode}`}>
          <span><b>{item.company}</b> {item.productName} <span className="my-savings__muted">· {KIND[item.kind]}</span></span>
          <button type="button" className="my-savings__small" onClick={() => remove(item)} aria-label={`${item.company} ${item.productName} 관심 해제`}>빼기</button>
        </li>)}
      </ul>}
    {session
      ? <div className="actions">
        <button type="button" className="button button--secondary" onClick={saveToAccount} disabled={busy}>내 계정에 저장</button>
        <button type="button" className="button button--secondary" onClick={loadFromAccount} disabled={busy}>계정에서 불러오기</button>
        <button type="button" className="button button--secondary" onClick={clearAccount} disabled={busy}>계정 저장분 지우기</button>
      </div>
      : <p className="my-savings__muted"><Link to="/auth">로그인</Link>하면 관심 상품을 계정에 저장해 다른 기기에서 불러올 수 있어요.</p>}
    {note && <p className="my-savings__muted" role="status">{note}</p>}
    <p className="my-savings__muted">버튼을 누르기 전에는 이 기기 밖으로 나가지 않아요. 계정에 저장한 목록은 언제든 지울 수 있어요.</p>
  </section>
}
