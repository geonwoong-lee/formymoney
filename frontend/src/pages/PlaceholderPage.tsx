interface PlaceholderPageProps {
  eyebrow: string
  title: string
  description: string
}

export function PlaceholderPage({ eyebrow, title, description }: PlaceholderPageProps) {
  return (
    <section className="page">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="lead">{description}</p>
      <div className="notice">현재 Phase 1에서는 화면 경로와 공통 구조만 준비했습니다. 실제 금융 기능과 숫자는 다음 Phase부터 공식 자료를 기반으로 구현합니다.</div>
    </section>
  )
}
