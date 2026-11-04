import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { getYouthPolicies, type YouthPoliciesResponse, type YouthPolicy } from '../api/client'
import './MaturityPage.css'
import './YouthPoliciesPage.css'

const PAGE = 20
const MAX_SHOWN = 200  // the server returns at most this many at once
const isWebLink = (url: string) => /^https?:\/\//i.test(url)
const dotted = (value: string | null) => (value ? value.replaceAll('-', '.') : '')

function Row({ policy }: { policy: YouthPolicy }) {
  return <li className="deposit-product">
    <p className="deposit-product__name"><b>{policy.name}</b> <span className="deposit-product__type">{policy.category}</span>{policy.ageLabel && <> <span className="deposit-product__type">{policy.ageLabel}</span></>} <span className="deposit-product__type">{policy.regionLabel}</span></p>
    {policy.institution && <p className="maturity-muted">{policy.institution}</p>}
    {policy.support && <p className="youth-policy__support">{policy.support}</p>}
    <p>신청 기간 <span className="deposit-product__amount">{policy.applyLabel}</span></p>
    <details className="deposit-terms">
      <summary>대상 조건·신청 방법</summary>
      <dl>
        {policy.support && <><dt>지원 내용</dt><dd className="deposit-terms__text">{policy.support}</dd></>}
        {policy.summary && <><dt>정책 설명</dt><dd className="deposit-terms__text">{policy.summary}</dd></>}
        {policy.incomeNote && <><dt>소득 조건</dt><dd className="deposit-terms__text">{policy.incomeNote}</dd></>}
        {policy.extraConditions && <><dt>추가 자격</dt><dd className="deposit-terms__text">{policy.extraConditions}</dd></>}
        {policy.applyMethod && <><dt>신청 방법</dt><dd className="deposit-terms__text">{policy.applyMethod}</dd></>}
        {policy.selection && <><dt>선정 방법</dt><dd className="deposit-terms__text">{policy.selection}</dd></>}
      </dl>
    </details>
    <p className="maturity-muted">
      {isWebLink(policy.applyUrl) && <a href={policy.applyUrl} target="_blank" rel="noreferrer">신청·공고 ↗</a>}
      {isWebLink(policy.applyUrl) && isWebLink(policy.refUrl) && ' · '}
      {isWebLink(policy.refUrl) && <a href={policy.refUrl} target="_blank" rel="noreferrer">참고 ↗</a>}
      {policy.modifiedOn && <>{(isWebLink(policy.applyUrl) || isWebLink(policy.refUrl)) ? ' · ' : ''}{dotted(policy.modifiedOn)} 수정</>}
    </p>
  </li>
}

// 청년정책 찾기: the policies registered on 온통청년, filtered on the server. The age typed here only narrows the request.
export function YouthPoliciesPage() {
  const id = useId()
  const [keyword, setKeyword] = useState('')
  const [category, setCategory] = useState('')
  const [region, setRegion] = useState('')
  const [age, setAge] = useState('')
  const [openOnly, setOpenOnly] = useState(true)
  const [sort, setSort] = useState<'deadline' | 'recent'>('deadline')
  const [shown, setShown] = useState(PAGE)
  const [loaded, setLoaded] = useState<{ key: string; body: YouthPoliciesResponse | null } | null>(null)
  const ageValue = age.trim() === '' ? null : Number(age)
  const ageInvalid = ageValue !== null && (!Number.isInteger(ageValue) || ageValue < 0 || ageValue > 120)
  const key = `${keyword.trim()}|${category}|${region}|${ageValue}|${openOnly}|${sort}|${shown}`
  const body = loaded?.key === key ? loaded.body : undefined
  const [options, setOptions] = useState<Pick<YouthPoliciesResponse, 'categories' | 'regions'>>({ categories: [], regions: [] })

  useEffect(() => {
    if (ageInvalid) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      getYouthPolicies({ keyword: keyword.trim(), category, region, age: ageValue, openOnly, sort, offset: 0, limit: shown }, controller.signal)
        .then((response) => { setLoaded({ key, body: response }); setOptions({ categories: response.categories, regions: response.regions }) })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === 'AbortError') return
          setLoaded({ key, body: null })
        })
    }, 300)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [key, ageInvalid, keyword, category, region, ageValue, openOnly, sort, shown])

  const reset = () => setShown(PAGE)
  return <section className="page page--wide maturity-page">
    <p className="eyebrow">Youth policies</p>
    <h1>청년정책 찾기</h1>
    <p className="lead">온통청년에 등록된 청년정책을 분야·지역·나이로 좁혀서 볼 수 있어요. 대상인지 판정하지는 않고, 신청 전에 공고에서 조건을 확인해야 해요.</p>

    <section className="maturity-step" aria-labelledby={`${id}-filters`}>
      <h2 id={`${id}-filters`}>1. 어떤 정책을 찾나요?</h2>
      <div className="maturity-inputs">
        <label><span>검색어</span>
          <input type="search" maxLength={50} placeholder="예: 월세, 취업, 대출 이자" value={keyword} onChange={(event) => { setKeyword(event.target.value); reset() }} />
        </label>
        <label><span>분야</span>
          <select value={category} onChange={(event) => { setCategory(event.target.value); reset() }}>
            <option value="">모두</option>
            {options.categories.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label><span>지역</span>
          <select value={region} onChange={(event) => { setRegion(event.target.value); reset() }}>
            <option value="">전체</option>
            {options.regions.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
          </select>
        </label>
        <label><span>내 나이(만, 선택)</span>
          <input type="number" inputMode="numeric" min={0} max={120} value={age} aria-invalid={ageInvalid} onChange={(event) => { setAge(event.target.value); reset() }} />
        </label>
        <label><span>정렬</span>
          <select value={sort} onChange={(event) => { setSort(event.target.value as 'deadline' | 'recent'); reset() }}>
            <option value="deadline">신청 마감이 가까운 순</option>
            <option value="recent">최근 수정된 순</option>
          </select>
        </label>
        <label className="youth-policy__check"><input type="checkbox" checked={openOnly} onChange={(event) => { setOpenOnly(event.target.checked); reset() }} /> <span>신청 기간이 끝난 정책은 빼기</span></label>
      </div>
      <p className="maturity-muted">나이는 정책에 나이 제한이 적혀 있을 때만 걸러요. 입력한 나이는 저장하지 않아요.</p>
      {ageInvalid && <p className="maturity-error" role="alert">나이는 0~120 사이의 정수로 넣어 주세요.</p>}
    </section>

    {!ageInvalid && <section className="maturity-step" aria-labelledby={`${id}-results`}>
      <h2 id={`${id}-results`}>찾은 청년정책</h2>
      {body === undefined && <p className="maturity-muted">청년정책을 불러오는 중이에요.</p>}
      {body === null && <p className="maturity-muted">청년정책을 불러오지 못했어요. 잠시 후 다시 확인해 주세요.</p>}
      {body && body.total === 0 && <p className="maturity-muted">아직 수집된 청년정책이 없어요. 수집이 끝난 뒤에 다시 확인해 주세요.</p>}
      {body && body.total > 0 && body.count === 0 && <p className="maturity-muted">고른 조건에 맞는 정책이 없어요. 조건을 바꿔 보세요.</p>}
      {body && body.count > 0 && <>
        <p className="maturity-muted">전체 {body.total.toLocaleString('ko-KR')}개 중 {body.count.toLocaleString('ko-KR')}개를 찾았어요. {sort === 'deadline' ? '신청 마감이 가까운 순서' : '최근에 수정된 순서'}예요.</p>
        <ul className="deposit-products" aria-label="청년정책 목록">
          {body.policies.map((policy) => <Row key={policy.policyNo} policy={policy} />)}
        </ul>
        {shown < Math.min(body.count, MAX_SHOWN) && <button type="button" className="button button--secondary" onClick={() => setShown((count) => Math.min(MAX_SHOWN, count + PAGE))}>
          {Math.min(PAGE, body.count - shown)}개 더 보기 ({shown}/{body.count})
        </button>}
        {shown >= MAX_SHOWN && body.count > MAX_SHOWN && <p className="maturity-muted">{MAX_SHOWN}개까지만 보여 줘요. 검색어, 분야, 지역으로 조건을 좁혀 보세요.</p>}
        <ul className="deposit-notes">{body.notes.map((note) => <li key={note}>{note}</li>)}</ul>
        <p className="maturity-muted">출처 <a href={body.sourceUrl} target="_blank" rel="noreferrer">{body.sourceName} ↗</a>{body.day ? ` · ${body.day.replaceAll('-', '.')} 수집` : ''}</p>
      </>}
    </section>}

    <nav className="maturity-links" aria-label="관련 화면">
      <Link className="button button--secondary" to="/conditions">내 조건</Link>
      <Link className="button button--secondary" to="/general-savings">일반 적금 비교</Link>
    </nav>
  </section>
}
