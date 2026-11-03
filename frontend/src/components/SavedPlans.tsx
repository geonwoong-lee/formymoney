import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { deleteAllPlans, deletePlan, listSavedPlans, overwritePlan, savePlan, type SavedPlan } from '../api/client'
import { loadDraft, saveDraft, type VeryRichDraft } from '../storage/draftStorage'

const won = (value: number) => `${value.toLocaleString('ko-KR')}원`

function summary(draft: VeryRichDraft) {
  const parts = []
  if (draft.plan.monthlyAmount) parts.push(`월 ${won(draft.plan.monthlyAmount)}`)
  if (draft.plan.startMonth) parts.push(`${draft.plan.startMonth.replace('-', '년 ')}월 가입`)
  const answered = Object.keys(draft.conditions).length
  if (answered) parts.push(`조건 답 ${answered}개`)
  const months = Object.keys(draft.monthlyPayments).length
  if (months) parts.push(`월별 납입 ${months}개월`)
  return parts.length ? parts.join(' · ') : '입력 없음'
}

function isEmpty(draft: VeryRichDraft) {
  return !draft.plan.monthlyAmount && Object.keys(draft.conditions).length === 0 && Object.keys(draft.monthlyPayments).length === 0
}

// The server sends missing fields as null; the browser draft leaves them out.
function toBrowserDraft(draft: VeryRichDraft): VeryRichDraft {
  const plan = Object.fromEntries(Object.entries(draft.plan).filter(([, value]) => value !== null && value !== undefined))
  return { ...draft, plan }
}

// Plans are saved only when the user presses save, and can be deleted one by one or all at once.
export function SavedPlans({ accessToken }: { accessToken: string }) {
  const [plans, setPlans] = useState<SavedPlan[] | null>(null)
  const [limit, setLimit] = useState(10)
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [current, setCurrent] = useState(() => loadDraft())

  useEffect(() => {
    const controller = new AbortController()
    listSavedPlans(accessToken, controller.signal)
      .then((body) => { setPlans(body.plans); setLimit(body.limit) })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setError(cause instanceof Error ? cause.message : '저장한 계획을 불러오지 못했어요.')
      })
    return () => controller.abort()
  }, [accessToken])

  async function run(action: () => Promise<void>, done: string) {
    setError('')
    setMessage('')
    try {
      await action()
      setMessage(done)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '처리하지 못했어요.')
    }
  }

  function create(event: FormEvent) {
    event.preventDefault()
    const draft = loadDraft()
    void run(async () => {
      const saved = await savePlan(accessToken, name.trim(), draft)
      setPlans((list) => [saved, ...(list ?? [])])
      setName('')
    }, '지금 입력을 계획으로 저장했어요.')
  }

  function load(plan: SavedPlan) {
    if (!window.confirm(`'${plan.name}'을 불러오면 이 기기에 입력해 둔 조건과 납입액이 바뀌어요. 불러올까요?`)) return
    const draft = toBrowserDraft(plan.draft)
    saveDraft(draft)
    setCurrent(draft)
    setError('')
    setMessage(`'${plan.name}'을 불러왔어요. 내 조건이나 납입 계획에서 이어서 볼 수 있어요.`)
  }

  function overwrite(plan: SavedPlan) {
    if (!window.confirm(`'${plan.name}'을 지금 이 기기의 입력으로 바꿀까요?`)) return
    const draft = loadDraft()
    void run(async () => {
      const saved = await overwritePlan(accessToken, plan.id, plan.name, draft)
      setPlans((list) => (list ?? []).map((item) => item.id === saved.id ? saved : item))
    }, `'${plan.name}'을 지금 입력으로 바꿨어요.`)
  }

  function remove(plan: SavedPlan) {
    if (!window.confirm(`'${plan.name}'을 지울까요? 되돌릴 수 없어요.`)) return
    void run(async () => {
      await deletePlan(accessToken, plan.id)
      setPlans((list) => (list ?? []).filter((item) => item.id !== plan.id))
    }, `'${plan.name}'을 지웠어요.`)
  }

  function removeAll() {
    if (!window.confirm('저장한 계획을 모두 지울까요? 되돌릴 수 없어요.')) return
    void run(async () => {
      await deleteAllPlans(accessToken)
      setPlans([])
    }, '저장한 계획을 모두 지웠어요.')
  }

  const full = (plans?.length ?? 0) >= limit
  return <section className="saved-plans" aria-labelledby="saved-plans-title">
    <h2 id="saved-plans-title">저장한 계획</h2>
    <p className="saved-plans__note">저장 버튼을 누를 때만 지금 이 기기의 입력(조건 답, 은행, 월 납입액, 월별 납입액)을 내 계정에 저장해요. 다른 기기에서 로그인해 불러올 수 있고, 언제든 지울 수 있어요. 최대 {limit}개.</p>

    <form className="saved-plans__form" onSubmit={create}>
      <p>지금 이 기기의 입력: <b>{summary(current)}</b></p>
      <label>계획 이름
        <input value={name} maxLength={40} onChange={(event) => setName(event.target.value)} placeholder="예: 월 50만 원 국민은행" />
      </label>
      <button className="button" type="submit" disabled={!name.trim() || isEmpty(current) || full || plans === null}>지금 입력 저장</button>
      {isEmpty(current) && <p className="saved-plans__note">저장할 입력이 없어요. <Link to="/conditions">내 조건 입력</Link>부터 해 주세요.</p>}
      {full && <p className="saved-plans__note">{limit}개를 모두 썼어요. 안 쓰는 계획을 지우면 새로 저장할 수 있어요.</p>}
    </form>

    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
    {plans === null && !error && <p role="status">저장한 계획을 불러오는 중이에요.</p>}
    {plans && plans.length === 0 && <p>아직 저장한 계획이 없어요.</p>}
    {plans && plans.length > 0 && <>
      <ul className="saved-plans__list" aria-label="저장한 계획 목록">
        {plans.map((plan) => <li key={plan.id}>
          <div>
            <b>{plan.name}</b>
            <span className="saved-plans__note">{summary(plan.draft)} · {new Date(plan.updatedAt).toLocaleDateString('ko-KR')} 저장</span>
          </div>
          <div className="saved-plans__actions">
            <button className="button button--secondary" type="button" onClick={() => load(plan)}>불러오기</button>
            <button className="button button--secondary" type="button" onClick={() => overwrite(plan)} disabled={isEmpty(current)}>지금 입력으로 바꾸기</button>
            <button className="button button--secondary" type="button" onClick={() => remove(plan)}>지우기</button>
          </div>
        </li>)}
      </ul>
      <button className="button button--secondary" type="button" onClick={removeAll}>저장한 계획 모두 지우기</button>
    </>}
  </section>
}
