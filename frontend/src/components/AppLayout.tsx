import type { PropsWithChildren } from 'react'
import { Link } from 'react-router-dom'

const navigation = [
  { to: '/conditions', label: '조건 입력' },
  { to: '/banks', label: '은행 비교' },
  { to: '/cashflow', label: '납입 계획' },
  { to: '/alternatives', label: '대안 비교' },
  { to: '/about', label: '계산 기준' },
]

export function AppLayout({ children }: PropsWithChildren) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__inner">
          <Link className="brand" to="/">
            Very Rich?
          </Link>
          <nav className="navigation" aria-label="주요 메뉴">
            {navigation.map((item) => (
              <Link key={item.to} to={item.to}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}
