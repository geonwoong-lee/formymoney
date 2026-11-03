import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getEvents, getMyStatus, getSavingsProducts, listSavedPlans,
  type ConditionResult, type MyStatusResponse, type SavedPlan, type UpcomingEvent,
} from '../api/client'
import { ErrorNotice } from '../components/ErrorNotice'
import { MonthlyConditionCheck } from '../components/MonthlyConditionCheck'
import { MyReminders } from '../components/MyReminders'
import { MyWatchlist } from '../components/MyWatchlist'
import { RateAlerts } from '../components/RateAlerts'
import { answersForApi } from '../features/savingsDraft'
import { loadAuthSession } from '../storage/authStorage'
import { loadDraft, type VeryRichDraft } from '../storage/draftStorage'
import './MySavingsPage.css'

const won = (value: number) => `${value.toLocaleString('ko-KR')}원`
const monthLabel = (month: string) => `${month.slice(0, 4)}년 ${Number(month.slice(5, 7))}월`
const THIS_DEVICE = 'device'

function eventDay(iso: string) {
  const [, month, day] = iso.split('-').map(Number)
  return `${month}월 ${day}일`
}

function Phase({ status }: { status: MyStatusResponse }) {
  const { timeline } = status
  if (timeline.phase === 'saving' && timeline.currentRound) {
    const percent = Math.round((timeline.currentRound / timeline.termMonths) * 100)
    return <>
      <p className="my-savings__phase">{timeline.termMonths}회 중 <b>{timeline.currentRound}회차</b>를 넣는 달이에요</p>
      <div className="my-savings__progress" role="progressbar" aria-label="납입 진행" aria-valuemin={0} aria-valuemax={timeline.termMonths} aria-valuenow={timeline.currentRound}>
        <span style={{ width: `${percent}%` }} />
      </div>
      <p className="my-savings__muted">{timeline.startMonth && monthLabel(timeline.startMonth)} 시작 · 만기 {timeline.maturityMonth && monthLabel(timeline.maturityMonth)}까지 {timeline.monthsToMaturity}개월 남았어요</p>
    </>
  }
  if (timeline.phase === 'matured') {
    return <p className="my-savings__phase">만기({timeline.maturityMonth && monthLabel(timeline.maturityMonth)})가 지났어요. <Link to="/maturity">만기 후 계획</Link>에서 목돈을 어디에 둘지 비교해 보세요.</p>
  }
  if (timeline.phase === 'before_start') {
    return <p className="my-savings__phase">아직 납입 전이에요{timeline.startMonth ? `. ${monthLabel(timeline.startMonth)}부터 넣는 것으로 계산했어요` : ''}.</p>
  }
  return <p className="my-savings__phase">가입한 달을 넣으면 지금 몇 회차인지 알려 드려요. <Link to="/conditions">내 조건에서 가입 상태와 가입월 넣기</Link></p>
}

function ConditionList({ title, items, mark }: { title: string; items: ConditionResult[]; mark: string }) {
  if (items.length === 0) return null
  return <div className="my-savings__conditions">
    <h3>{title} {items.length}개</h3>
    <ul>{items.map((item) => <li key={item.code}><span aria-hidden="true">{mark}</span> {item.title}{item.appliedBonusRate > 0 && <span className="my-savings__muted"> +{item.appliedBonusRate}%p</span>}</li>)}</ul>
  </div>
}

function Status({ status, events }: { status: MyStatusResponse; events: UpcomingEvent[] }) {
  const { result } = status.cashflow
  const { payments, conditions } = status
  return <>
    <section className="my-savings__card" aria-labelledby="my-savings-now">
      <h2 id="my-savings-now">지금 내 적금</h2>
      <p className="my-savings__muted">{result.bankName} {result.productName} · 예상금리 연 {result.expectedRate}%</p>
      <Phase status={status} />
      <dl className="money-breakdown">
        <div><dt>예상 만기금액</dt><dd>{won(result.expectedMaturityAmount)}</dd></div>
        <div><dt>내가 넣는 원금</dt><dd>{won(result.principal)}</dd></div>
        <div><dt>은행 이자</dt><dd>{won(result.depositInterest)}</dd></div>
        <div><dt>정부기여금과 이자</dt><dd>{won(result.governmentContribution + result.governmentContributionInterest)}</dd></div>
      </dl>
      {status.cashflow.differenceFromFixedPlan !== 0 && <p className="my-savings__muted">
        매달 똑같이 넣었을 때보다 {won(Math.abs(status.cashflow.differenceFromFixedPlan))} {status.cashflow.differenceFromFixedPlan < 0 ? '적어요' : '많아요'}(월별 납입 계획 반영).
      </p>}
    </section>

    <section className="my-savings__card" aria-labelledby="my-savings-payments">
      <h2 id="my-savings-payments">납입 현황</h2>
      {status.timeline.phase === 'saving' || status.timeline.phase === 'matured' ? <>
        <dl className="money-breakdown">
          <div><dt>이번 달까지 넣은 돈</dt><dd>{won(payments.paidAmount)}<small> ({payments.paidRounds}회)</small></dd></div>
          <div><dt>앞으로 넣을 돈</dt><dd>{won(payments.remainingAmount)}<small> ({payments.remainingRounds}회)</small></dd></div>
        </dl>
        {payments.skippedRounds.length > 0 && <p className="my-savings__warn">건너뛴 회차: {payments.skippedRounds.join(', ')}회차. 건너뛴 달은 원금·이자·정부기여금이 모두 빠져요.</p>}
        {payments.reducedRounds.length > 0 && <p className="my-savings__muted">줄여서 넣은 회차: {payments.reducedRounds.join(', ')}회차</p>}
        {payments.skippedRounds.length === 0 && payments.reducedRounds.length === 0 && <p className="my-savings__muted">지금까지 계획대로 넣었어요.</p>}
      </> : <p className="my-savings__muted">가입하고 납입을 시작하면 낸 돈과 남은 돈을 나눠 보여 드려요.</p>}
      <p className="my-savings__muted">실제로 넣은 금액은 <Link to="/cashflow">월별 납입 계획</Link>에서 고칠 수 있어요. 이 화면은 그 입력을 기준으로 계산해요.</p>
    </section>

    <section className="my-savings__card" aria-labelledby="my-savings-conditions">
      <h2 id="my-savings-conditions">우대조건</h2>
      {conditions.ifCheckedGain !== null && conditions.ifCheckedGain > 0 && <p className="my-savings__highlight">
        &lsquo;모름&rsquo;으로 둔 조건을 모두 채우면 만기금액이 최대 <span className="my-savings__amount">{won(conditions.ifCheckedGain)}</span> 늘어 {won(conditions.ifCheckedMaturityAmount ?? 0)}이 돼요. <Link to="/conditions">조건 다시 확인하기</Link>
      </p>}
      <ConditionList title="반영된 조건" items={conditions.applied} mark="✓" />
      <ConditionList title="확인이 필요한 조건" items={conditions.needsCheck} mark="?" />
      <ConditionList title="못 채운 조건" items={conditions.notApplied} mark="✕" />
      <p className="my-savings__muted">우대조건은 은행이 정한 기간 동안 계속 채워야 하는 경우가 많아요. 정확한 조건은 은행 상품 설명서에서 확인해 주세요.</p>
    </section>

    {status.timeline.phase === 'saving' && conditions.applied.length > 0 && <MonthlyConditionCheck applied={conditions.applied} impacts={conditions.impacts} />}

    {status.timeline.startMonth && status.timeline.phase !== 'unknown' && <MyReminders
      startMonth={status.timeline.startMonth} termMonths={status.timeline.termMonths} bankName={result.bankName} productName={result.productName}
      matured={status.timeline.phase === 'matured'}
    />}

    {status.timeline.phase !== 'unknown' && <section className="my-savings__card" aria-labelledby="my-savings-after">
      <h2 id="my-savings-after">만기 후엔 어떻게 할까요?</h2>
      <p>예상 만기금액 <b>{won(result.expectedMaturityAmount)}</b>을 정기예금에 맡길 때와 다른 선택에 두었을 때를 과거 기록으로 견주어 볼 수 있어요.</p>
      <Link className="button button--secondary" to="/maturity?from=my-savings">만기 후 계획으로 이어서 보기</Link>
      <p className="my-savings__muted">예상 금액은 자동으로 넣어 드려요. 어떤 선택을 권하지는 않아요.</p>
    </section>}

    <section className="my-savings__card" aria-labelledby="my-savings-events">
      <h2 id="my-savings-events">다가올 일정</h2>
      {events.length === 0
        ? <p className="my-savings__muted">60일 안에 잡힌 공식 일정이 없어요.</p>
        : <ul className="my-savings__events">{events.slice(0, 3).map((event) => <li key={event.key}>
          <b>{event.dDay === 0 ? '오늘' : `D-${event.dDay}`}</b> {eventDay(event.date)} {event.title}
        </li>)}</ul>}
      <p className="my-savings__muted"><Link to="/daily?tab=events">일정 모두 보기</Link> · <Link to="/maturity">만기 후 계획·만기 알림</Link></p>
    </section>
  </>
}

// "내 적금": the inputs kept on this device (or a saved plan, when signed in) turned into one view of where the
// savings stand. Every number is calculated by the server; nothing here is advice.
export function MySavingsPage() {
  const [source, setSource] = useState(THIS_DEVICE)
  const [plans, setPlans] = useState<SavedPlan[]>([])
  const [loaded, setLoaded] = useState<{ source: string; status: MyStatusResponse | null; error: string } | null>(null)
  const [events, setEvents] = useState<UpcomingEvent[]>([])
  const [reloadKey, setReloadKey] = useState(0)

  const draft: VeryRichDraft = source === THIS_DEVICE ? loadDraft() : plans.find((plan) => String(plan.id) === source)?.draft ?? loadDraft()
  const bankCode = draft.plan.currentBankCode
  const current = loaded?.source === `${source}-${reloadKey}` ? loaded : null

  useEffect(() => {
    const session = loadAuthSession()
    const controller = new AbortController()
    if (session) listSavedPlans(session.accessToken, controller.signal).then((body) => setPlans(body.plans)).catch(() => setPlans([]))
    getEvents(controller.signal).then((body) => setEvents(body.items)).catch(() => setEvents([]))
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!bankCode) return
    const key = `${source}-${reloadKey}`
    const controller = new AbortController()
    getSavingsProducts().then((products) => {
      const fixed = draft.plan.monthlyAmount ?? 500_000
      const term = products.policy.termMonths
      return getMyStatus({
        bankCode, fixedMonthlyAmount: fixed, contributionType: draft.plan.contributionType ?? 'general',
        monthlyAmounts: Array.from({ length: term }, (_, index) => draft.monthlyPayments[String(index + 1)] ?? fixed),
        conditionAnswers: answersForApi(draft, products.products)[bankCode] ?? {},
        ...(draft.plan.startMonth ? { startMonth: draft.plan.startMonth } : {}),
        enrolled: draft.plan.enrollmentStatus === 'enrolled',
      }, controller.signal)
    }).then((status) => setLoaded({ source: key, status, error: '' })).catch((cause: unknown) => {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      setLoaded({ source: key, status: null, error: cause instanceof Error ? cause.message : '내 적금을 계산하지 못했습니다.' })
    })
    return () => controller.abort()
    // The draft is read fresh for the chosen source; re-run only when the source or a retry changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, reloadKey, bankCode, plans])

  return <section className="page page--wide my-savings">
    <p className="eyebrow">My savings</p>
    <h1>내 적금</h1>
    <p className="lead">지금 몇 회차인지, 만기에 얼마를 받을지, 놓친 납입과 우대조건, 다가올 일정을 한곳에서 봐요.</p>
    <RateAlerts />

    {plans.length > 0 && <label className="my-savings__source">
      <span>어떤 계획으로 볼까요?</span>
      <select value={source} onChange={(event) => setSource(event.target.value)}>
        <option value={THIS_DEVICE}>이 기기에 입력한 내용</option>
        {plans.map((plan) => <option key={plan.id} value={String(plan.id)}>저장한 계획: {plan.name}</option>)}
      </select>
    </label>}

    {!bankCode && <div className="notice">
      <p>아직 어느 은행 적금인지 정하지 않았어요. 내 조건에서 은행과 월 납입액을 정하면 이 화면이 채워져요.</p>
      <div className="actions"><Link className="button" to="/conditions">내 조건 입력하기</Link></div>
    </div>}
    {bankCode && !current && <p className="notice">내 적금을 계산하는 중입니다.</p>}
    {current?.error && <ErrorNotice message={current.error} onRetry={() => setReloadKey((key) => key + 1)} />}
    {current?.status && <Status status={current.status} events={events} />}

    <MyWatchlist />

    <p className="my-savings__muted my-savings__foot">이 화면은 입력한 내용으로 계산한 예상치예요. 실제 금액은 은행 앱의 계좌 정보를 기준으로 확인해 주세요. 가입·해지를 권하지 않아요.</p>
  </section>
}
