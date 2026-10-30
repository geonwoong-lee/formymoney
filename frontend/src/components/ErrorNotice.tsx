import type { ReactNode } from 'react'

interface ErrorNoticeProps {
  message: string
  onRetry?: () => void
  children?: ReactNode
}

export function ErrorNotice({ message, onRetry, children }: ErrorNoticeProps) {
  return <div className="notice notice--error" role="alert">
    <span>{message}</span>
    {onRetry && <button className="button button--small" type="button" onClick={onRetry}>다시 시도</button>}
    {children}
  </div>
}
