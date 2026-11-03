import { useState } from 'react'
import { Link } from 'react-router-dom'
import { GLOSSARY } from '../features/glossary'
import './MaturityPage.css'

// 쉬운 용어 풀이: the words the numbers on this site are built from, with where each one shows up.
export function TermsPage() {
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const shown = GLOSSARY.filter((term) => !needle || `${term.name} ${term.meaning}`.toLowerCase().includes(needle))

  return <section className="page page--wide maturity-page">
    <p className="eyebrow">Plain words</p>
    <h1>쉬운 용어 풀이</h1>
    <p className="lead">이 사이트의 숫자가 어떤 말로 만들어지는지 쉬운 말로 풀었어요. 정확한 법·제도 내용은 해당 기관 안내를 함께 확인해 주세요.</p>

    <label className="maturity-search">
      <span>찾을 말</span>
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="예: 단리, 보증, 우대" />
    </label>

    {shown.length === 0 && <p className="maturity-muted">맞는 말이 없어요. 다른 말로 찾아 보세요.</p>}
    <dl className="glossary" aria-label="용어 목록">
      {shown.map((term) => <div key={term.slug} id={term.slug} className="glossary__item">
        <dt>{term.name}</dt>
        <dd>
          <p>{term.meaning}</p>
          <p className="maturity-muted">이 사이트에서는: {term.where}{term.link && <> · <Link to={term.link.to}>{term.link.label}</Link></>}</p>
        </dd>
      </div>)}
    </dl>
  </section>
}
