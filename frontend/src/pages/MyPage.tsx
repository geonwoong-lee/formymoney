import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError, getMe, type AuthUser } from '../api/client'
import { clearAuthSession, loadAuthSession } from '../storage/authStorage'
import './AuthPage.css'

type UserState =
  | { kind: 'loading' }
  | { kind: 'guest' }
  | { kind: 'ready'; user: AuthUser }
  | { kind: 'error'; message: string }

export function MyPage() {
  const navigate = useNavigate()
  const [session] = useState(() => loadAuthSession())
  const [state, setState] = useState<UserState>(session ? { kind: 'loading' } : { kind: 'guest' })

  useEffect(() => {
    if (!session) return
    getMe(session.accessToken)
      .then((user) => setState({ kind: 'ready', user }))
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) {
          clearAuthSession()
          setState({ kind: 'guest' })
          return
        }
        setState({ kind: 'error', message: error instanceof Error ? error.message : '회원 정보를 불러오지 못했습니다.' })
      })
  }, [session])

  function logout() {
    clearAuthSession()
    navigate('/auth')
  }

  return (
    <section className="page auth-page">
      <p className="eyebrow">My Very Rich?</p>
      <h1>내 회원 정보</h1>
      {state.kind === 'loading' && <p role="status">회원 정보를 확인하는 중입니다.</p>}
      {state.kind === 'guest' && <p>로그인이 필요합니다. <Link to="/auth">로그인하기</Link></p>}
      {state.kind === 'error' && <p role="alert">{state.message}</p>}
      {state.kind === 'ready' && (
        <div className="profile-card">
          <dl>
            <div><dt>표시 이름</dt><dd>{state.user.displayName ?? '미설정'}</dd></div>
            <div><dt>이메일</dt><dd>{state.user.email}</dd></div>
            <div><dt>가입일</dt><dd>{state.user.createdAt ? new Date(state.user.createdAt).toLocaleDateString('ko-KR') : '확인 불가'}</dd></div>
          </dl>
          <button className="button button--secondary" type="button" onClick={logout}>로그아웃</button>
        </div>
      )}
    </section>
  )
}
