import { useEffect, useState } from 'react'
import { getBankFinancials, getDartBanks, type BankFinancials } from '../api/client'
import { FinancialsSource, FinancialsTable } from '../components/BankFinancials'
import { TeacherNote } from '../components/TeacherNote'
import { formatChangePercent, formatKrwLarge, peerRangeText } from '../features/krw'

const DEFAULT_BANK = 'kb'

// 국민은행이 / 카카오뱅크가: pick the particle by whether the last syllable has a final consonant.
function withParticle(word: string, consonant: string, vowel: string) {
  const code = word.charCodeAt(word.length - 1) - 0xac00
  return word + (code >= 0 && code < 11172 && code % 28 !== 0 ? consonant : vowel)
}

function amount(data: BankFinancials, key: BankFinancials['items'][number]['key']) {
  return data.items.find((item) => item.key === key)
}

function Lesson({ data }: { data: BankFinancials }) {
  const assets = amount(data, 'assets')
  const liabilities = amount(data, 'liabilities')
  const equity = amount(data, 'equity')
  const deposits = amount(data, 'deposits')
  const netInterest = amount(data, 'net_interest')
  const netIncome = amount(data, 'net_income')
  const name = data.corpName
  const peers = peerRangeText(data.peers.equityToAssets)

  return <ol className="finance-lesson__steps">
    <li>
      <h3>1. 재무제표는 회사의 가계부예요</h3>
      <TeacherNote>
        <p>재무제표에서 먼저 볼 표는 두 개예요. <b>재무상태표</b>는 연말 하루에 찍은 사진처럼 가진 것과 갚을 것을 보여 줘요. <b>손익계산서</b>는 1년 동안 번 돈과 쓴 돈을 보여 주는 동영상 같은 표예요.</p>
        <p>지금부터 {name}의 {data.year}년 {data.statement}를 같이 읽어 볼게요.</p>
      </TeacherNote>
    </li>
    <li>
      <h3>2. 자산 = 부채 + 자본</h3>
      <TeacherNote>
        <p>{withParticle(name, '이', '가')} {data.year}년 말에 가진 것(자산)은 <b>{formatKrwLarge(assets?.current)}</b>이에요. 이 돈은 남에게 빌린 돈(부채) <b>{formatKrwLarge(liabilities?.current)}</b>과 자기 돈(자본) <b>{formatKrwLarge(equity?.current)}</b>으로 이루어져 있어요.</p>
        {data.balanced === true && <p>부채와 자본을 더하면 자산과 똑같아요. 재무상태표는 언제나 이렇게 양쪽이 맞아야 해요.</p>}
        {data.balanced === false && <p>이 자료에서는 부채와 자본을 더한 값이 자산과 조금 달라요. 계정 이름이 달라서 빠진 숫자가 있을 수 있으니 원문을 함께 봐 주세요.</p>}
      </TeacherNote>
    </li>
    <li>
      <h3>3. 내가 맡긴 예금은 은행에게 빚이에요</h3>
      <TeacherNote>
        <p>우리가 넣은 적금과 예금은 은행이 나중에 꼭 돌려줘야 하는 돈이에요. 그래서 은행 재무제표에서는 부채 칸에 <b>예수부채</b>라는 이름으로 적혀요.</p>
        <p>{name}의 예수부채는 <b>{formatKrwLarge(deposits?.current)}</b>이고, 부채 전체의 <b>{data.ratios.depositsToLiabilities ?? '–'}%</b>예요. 나머지는 은행이 채권을 발행하거나 다른 곳에서 빌린 돈이에요.</p>
      </TeacherNote>
    </li>
    <li>
      <h3>4. 자기 돈은 얼마나 될까요</h3>
      <TeacherNote>
        <p>자산 가운데 자기 돈(자본)의 몫은 <b>{data.ratios.equityToAssets ?? '–'}%</b>예요. 은행은 예금으로 모은 돈을 빌려주는 곳이라 다른 회사보다 이 몫이 작은 편이에요.</p>
        {peers && <p>비교해 보면 {peers}예요.</p>}
        <p>이 숫자는 단순한 나눗셈이에요. 감독 기관이 은행을 볼 때 쓰는 BIS 자기자본비율은 대출의 위험도까지 따져서 따로 계산해요.</p>
      </TeacherNote>
    </li>
    <li>
      <h3>5. 은행은 이자 차이로 돈을 벌어요</h3>
      <TeacherNote>
        <p>손익계산서로 넘어가 볼게요. 은행은 대출해 주고 받은 이자에서 예금자에게 준 이자를 빼고 남은 돈으로 주로 벌어요. 이것을 <b>순이자손익</b>이라고 해요.</p>
        <p>{name}의 {data.year}년 순이자손익은 <b>{formatKrwLarge(netInterest?.current)}</b>이고, 한 해 전보다 {formatChangePercent(netInterest?.changePercent ?? null)} 바뀌었어요.</p>
      </TeacherNote>
    </li>
    <li>
      <h3>6. 마지막에 남은 돈, 당기순이익</h3>
      <TeacherNote>
        <p>직원 월급, 건물 비용, 세금까지 모두 빼고 1년 동안 남은 돈이 <b>당기순이익</b>이에요. {withParticle(name, '은', '는')} <b>{formatKrwLarge(netIncome?.current)}</b>을 남겼고, 한 해 전보다 {formatChangePercent(netIncome?.changePercent ?? null)} 바뀌었어요.</p>
        <p>자산과 견주면 <b>{data.ratios.netIncomeToAssets ?? '–'}%</b>예요. 자산 100원으로 1년에 약 {data.ratios.netIncomeToAssets ?? '–'}원을 남겼다는 뜻이에요.</p>
      </TeacherNote>
    </li>
    <li>
      <h3>7. 원문에서 직접 찾아보기</h3>
      <TeacherNote>
        <p>아래 출처 링크를 누르면 DART에 올라온 사업보고서가 열려요. 왼쪽 목차에서 <b>III. 재무에 관한 사항</b>을 누르면 오늘 본 숫자를 그대로 찾을 수 있어요.</p>
        <p>{data.statement === '별도재무제표'
          ? '여기서는 별도재무제표를 썼어요. 자회사를 빼고 이 은행 하나만 본 표예요.'
          : '이 은행은 별도재무제표가 없어서 연결재무제표를 썼어요. 자회사까지 합친 표예요.'}</p>
      </TeacherNote>
    </li>
  </ol>
}

// The "재무제표" tab: a teacher-voiced walk through one bank's real DART numbers.
export function FinanceLesson() {
  const [banks, setBanks] = useState<{ bankCode: string; corpName: string }[] | null>(null)
  const [bankCode, setBankCode] = useState('')
  const [loaded, setLoaded] = useState<BankFinancials | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    getDartBanks(controller.signal).then((body) => {
      setBanks(body.banks)
      setBankCode(body.banks.some((bank) => bank.bankCode === DEFAULT_BANK) ? DEFAULT_BANK : body.banks[0]?.bankCode ?? '')
    }).catch((cause: unknown) => {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      setFailed(true)
    })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!bankCode) return
    const controller = new AbortController()
    getBankFinancials(bankCode, controller.signal).then(setLoaded).catch((cause: unknown) => {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      setFailed(true)
    })
    return () => controller.abort()
  }, [bankCode])

  // Numbers for a bank other than the one picked are still loading.
  const data = loaded?.bankCode === bankCode ? loaded : null

  return <section className="finance-lesson" aria-labelledby="finance-lesson-title">
    <h2 id="finance-lesson-title">재무제표 읽는 법</h2>
    <p className="daily-muted">은행이 금융감독원 전자공시시스템(DART)에 낸 진짜 숫자로 배워요.</p>
    {failed && <p className="daily-muted">재무 숫자를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.</p>}
    {!failed && banks === null && <p className="daily-muted">은행 목록을 불러오는 중입니다.</p>}
    {banks && banks.length === 0 && <p className="daily-muted">아직 모은 재무 숫자가 없어요.</p>}
    {banks && banks.length > 0 && <label className="finance-lesson__pick">
      예시로 볼 은행
      <select value={bankCode} onChange={(event) => setBankCode(event.target.value)}>
        {banks.map((bank) => <option key={bank.bankCode} value={bank.bankCode}>{bank.corpName}</option>)}
      </select>
    </label>}
    {bankCode && !data && !failed && <p className="daily-muted">숫자를 불러오는 중입니다.</p>}
    {data && <>
      <Lesson data={data} />
      <h3>표로 한 번에 보기</h3>
      <FinancialsTable data={data} />
      <p className="daily-muted">공시 숫자를 그대로 옮기고 나눗셈만 했어요. 은행이 안전한지, 어디에 가입할지 판단하는 자료가 아니에요.</p>
      <FinancialsSource data={data} />
    </>}
  </section>
}
