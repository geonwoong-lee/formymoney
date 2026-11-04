import { Link, useLocation } from 'react-router-dom'

// Shown for any address the site does not have, so a mistyped or old link says so instead of silently showing the home screen.
export function NotFoundPage() {
  const { pathname } = useLocation()
  return <section className="page">
    <p className="eyebrow">404</p>
    <h1>찾는 화면이 없어요</h1>
    <p className="lead">주소 <code>{pathname}</code>에 해당하는 화면이 없어요. 주소를 잘못 입력했거나 옮겨진 화면일 수 있어요.</p>
    <p><Link to="/" className="button">처음 화면으로 가기</Link></p>
  </section>
}
