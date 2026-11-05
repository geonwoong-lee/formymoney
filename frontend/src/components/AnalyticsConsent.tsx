import { useEffect, useState } from 'react'
import { readConsent, writeConsent, type Consent } from '../features/analytics'
import './AnalyticsConsent.css'

function useConsent(): Consent {
  const [consent, setConsent] = useState<Consent>(readConsent)
  useEffect(() => {
    const update = () => setConsent(readConsent())
    window.addEventListener('very-rich:analytics-consent', update)
    return () => window.removeEventListener('very-rich:analytics-consent', update)
  }, [])
  return consent
}

// Asked once; nothing is sent until the user says yes.
export function AnalyticsConsentBar() {
  const consent = useConsent()
  if (consent !== null) return null
  return <div className="analytics-consent" role="region" aria-label="익명 이용 통계 동의">
    <p><b>익명 이용 통계를 보내도 될까요?</b> 어떤 화면을 하루에 몇 번 썼는지와, 은행 비교에서 고른 우대조건 답(채울 수 있다·없다·모른다)을 하루 한 번 익명으로 세요. 누가 썼는지와 입력한 금액은 보내지 않아요.</p>
    <div>
      <button type="button" className="button" onClick={() => writeConsent('yes')}>보내도 돼요</button>
      <button type="button" className="button button--secondary" onClick={() => writeConsent('no')}>보내지 않을래요</button>
    </div>
  </div>
}

export function AnalyticsConsentToggle() {
  const consent = useConsent()
  return <p className="analytics-consent-toggle">
    익명 이용 통계: <b>{consent === 'yes' ? '보내는 중' : '보내지 않음'}</b>{' '}
    <button type="button" className="button button--secondary" onClick={() => writeConsent(consent === 'yes' ? 'no' : 'yes')}>
      {consent === 'yes' ? '그만 보내기' : '보내기'}
    </button>
  </p>
}
