import { useState } from 'react'
import { Link } from 'react-router-dom'
import { RateAlerts } from '../components/RateAlerts'
import { isSignedIn } from '../storage/authStorage'

export function HomePage() {
  const [signedIn] = useState(() => isSignedIn())

  return (
    <section className="page">
      <p className="eyebrow">How to be rich, very rich?</p>
      <h1>같은 돈의 다른 미래를 비교하세요.</h1>
      <RateAlerts />
      <p className="lead">
        최고금리 대신 내가 받을 수 있는 금리를 계산하고, 빠뜨린 납입까지 반영해 적금과 다른 선택을 같은 기준으로 살펴봅니다.
      </p>
      <section className="survey-evidence" aria-label="서비스 기획 근거">
        <div><strong>43%</strong><span>청년미래적금 가입 의향</span></div>
        <div><strong>32%</strong><span>가입 여부 유보</span></div>
        <div><strong>73%</strong><span>조건이 좋으면 새 은행 고려</span></div>
      </section>
      <p className="survey-source">
        컨슈머인사이트 2026년 금융플랫폼 기획조사 결과이며 실제 가입 행동을 뜻하지 않습니다.{' '}
        <a href="https://www.consumerinsight.co.kr/up_files/2606_finance.pdf" target="_blank" rel="noreferrer">설문 원문</a>
      </p>
      <div className="actions">
        <Link className="button" to="/conditions">
          내 조건 입력하기
        </Link>
        <Link className="button button--secondary" to="/about">
          계산 원칙 보기
        </Link>
        {signedIn
          ? <Link className="button button--secondary" to="/me">내 정보 보기</Link>
          : <Link className="button button--secondary" to="/auth">로그인 · 회원가입</Link>}
      </div>
    </section>
  )
}
