import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ApiError, login, signUp } from '../api/client'
import { isSignedIn, saveAuthSession } from '../storage/authStorage'
import './AuthPage.css'

type Mode = 'login' | 'signup'

export function AuthPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setMessage(null)
    try {
      const session = mode === 'signup'
        ? await signUp(email, password, displayName)
        : await login(email, password)
      if (saveAuthSession(session)) {
        navigate('/me')
      } else {
        setMessage('가입 확인 메일을 보냈습니다. 이메일을 확인한 뒤 로그인해 주세요.')
        setMode('login')
        setPassword('')
      }
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : '요청을 처리하지 못했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  if (isSignedIn()) return <Navigate to="/me" replace />

  return (
    <section className="page auth-page">
      <p className="eyebrow">Very Rich? Account</p>
      <h1>{mode === 'login' ? '로그인' : '회원가입'}</h1>
      <p className="lead">계산은 로그인 없이도 가능하며, 로그인하면 나중에 개인 기록을 저장할 수 있습니다.</p>

      <div className="auth-tabs" role="tablist" aria-label="회원 메뉴">
        <button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => setMode('login')}>로그인</button>
        <button type="button" role="tab" aria-selected={mode === 'signup'} onClick={() => setMode('signup')}>회원가입</button>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        {mode === 'signup' && (
          <label>
            표시 이름
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={50} required />
          </label>
        )}
        <label>
          이메일
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
        </label>
        <label>
          비밀번호
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} maxLength={128} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
        </label>
        <button className="button" type="submit" disabled={submitting}>
          {submitting ? '처리 중...' : mode === 'login' ? '로그인' : '가입하기'}
        </button>
      </form>

      {message && <p className="auth-message" role="status">{message}</p>}
      <p className="auth-guest"><Link to="/conditions">로그인하지 않고 계산하기</Link></p>
    </section>
  )
}
