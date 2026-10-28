import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getHealth, type HealthResponse } from '../api/client'

type HealthState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: HealthResponse }
  | { kind: 'error'; message: string }

export function HomePage() {
  const [health, setHealth] = useState<HealthState>({ kind: 'loading' })

  useEffect(() => {
    const controller = new AbortController()

    getHealth(controller.signal)
      .then((data) => setHealth({ kind: 'ready', data }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        const message = error instanceof Error ? error.message : '상태를 확인하지 못했습니다.'
        setHealth({ kind: 'error', message })
      })

    return () => controller.abort()
  }, [])

  return (
    <section className="page">
      <p className="eyebrow">How to be rich, very rich?</p>
      <h1>같은 돈의 다른 미래를 비교하세요.</h1>
      <p className="lead">
        최고금리 대신 내가 받을 수 있는 금리를 계산하고, 빠뜨린 납입까지 반영해 적금과 다른 선택을 같은 기준으로 살펴봅니다.
      </p>
      <div className="actions">
        <Link className="button" to="/conditions">
          내 조건 입력하기
        </Link>
        <Link className="button button--secondary" to="/about">
          계산 원칙 보기
        </Link>
      </div>
      <div className="status-card" aria-live="polite">
        <p className="status-card__label">개발 연결 상태</p>
        {health.kind === 'loading' && (
          <p className="status-card__value">
            <span className="status-dot" /> 백엔드와 SQLite를 확인하는 중입니다.
          </p>
        )}
        {health.kind === 'ready' && (
          <p className="status-card__value">
            <span className="status-dot status-dot--ok" /> FastAPI와 SQLite 연결 완료 · {health.data.referenceKey}
          </p>
        )}
        {health.kind === 'error' && (
          <p className="status-card__value">
            <span className="status-dot status-dot--error" /> {health.message}
          </p>
        )}
      </div>
    </section>
  )
}
