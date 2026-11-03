import { useId, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  loadEligibility, saveEligibility, YOUTH_OFFICIAL_NAME, YOUTH_OFFICIAL_URL, type YouthEligibility,
} from '../features/eligibility'
import './EligibilityCheck.css'

const CHOICES: { key: YouthEligibility; label: string }[] = [
  { key: 'eligible', label: '대상이에요' },
  { key: 'checking', label: '확인 중이에요' },
  { key: 'not_eligible', label: '대상이 아니에요' },
]

const NEXT: Record<YouthEligibility, { text: string; to: string; label: string }> = {
  eligible: { text: '내 조건을 넣으면 은행별로 받을 수 있는 금리와 만기금액을 계산해요.', to: '/conditions', label: '내 조건 입력하기' },
  checking: { text: '확인하는 동안 일반 적금이 얼마를 주는지 먼저 비교해 볼 수 있어요.', to: '/general-savings', label: '일반 적금 비교하기' },
  not_eligible: { text: '대상이 아니어도 공시된 일반 적금을 같은 방식으로 비교할 수 있어요.', to: '/general-savings', label: '일반 적금 비교하기' },
}

// The first question for anyone who arrives: are you a target of the youth savings? Self-reported, never judged here.
export function EligibilityCheck({ compact = false }: { compact?: boolean }) {
  const id = useId()
  const [value, setValue] = useState(() => loadEligibility())
  const { pathname } = useLocation()

  function choose(next: YouthEligibility) {
    saveEligibility(next)
    setValue(next)
  }

  return <section className={`eligibility${compact ? ' eligibility--compact' : ''}`} aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`}>청년미래적금 가입 대상인가요?</h2>
    <div className="eligibility__choices" role="radiogroup" aria-labelledby={`${id}-title`}>
      {CHOICES.map((choice) => <label key={choice.key} className={`eligibility__choice${value === choice.key ? ' eligibility__choice--active' : ''}`}>
        <input type="radio" name={`${id}-choice`} checked={value === choice.key} onChange={() => choose(choice.key)} />
        <span>{choice.label}</span>
      </label>)}
    </div>
    <p className="eligibility__muted">
      나이와 소득 기준은 제도를 운영하는 곳이 정해요. 이 사이트는 대상 여부를 판단하지 않으니
      {' '}<a href={YOUTH_OFFICIAL_URL} target="_blank" rel="noreferrer">{YOUTH_OFFICIAL_NAME} ↗</a>에서 확인해 주세요.
    </p>
    {/* The next step is skipped on the screen it points to. */}
    {value && NEXT[value].to !== pathname && <p className="eligibility__next">
      {NEXT[value].text} <Link className="button button--small" to={NEXT[value].to}>{NEXT[value].label}</Link>
    </p>}
  </section>
}
