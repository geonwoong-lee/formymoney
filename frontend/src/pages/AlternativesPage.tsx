import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  calculateComparison,
  getInvestmentAssets,
  getSavingsProducts,
  type ComparisonResponse,
  type InvestmentAssetsResponse,
  type SavingsProductsResponse,
} from '../api/client'
import { answersForApi } from '../features/savingsDraft'
import { loadDraft } from '../storage/draftStorage'

const money = new Intl.NumberFormat('ko-KR')

function monthlyAmounts(termMonths: number) {
  const draft = loadDraft()
  const baseAmount = draft.plan.monthlyAmount ?? 500_000
  return Array.from({ length: termMonths }, (_, index) => draft.monthlyPayments[String(index + 1)] ?? baseAmount)
}

export function AlternativesPage() {
  const [products, setProducts] = useState<SavingsProductsResponse | null>(null)
  const [assets, setAssets] = useState<InvestmentAssetsResponse | null>(null)
  const [selectedBank, setSelectedBank] = useState('')
  const [selectedAssets, setSelectedAssets] = useState<string[]>([])
  const [result, setResult] = useState<ComparisonResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function requestComparison(
    productData: SavingsProductsResponse,
    bankCode: string,
    assetCodes: string[],
  ) {
    const draft = loadDraft()
    const allAnswers = answersForApi(draft, productData.products)
    return calculateComparison({
      bankCode,
      monthlyAmounts: monthlyAmounts(productData.policy.termMonths),
      fixedMonthlyAmount: draft.plan.monthlyAmount ?? 500_000,
      contributionType: draft.plan.contributionType ?? 'general',
      conditionAnswers: allAnswers[bankCode] ?? {},
      assetCodes,
    })
  }

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    Promise.all([getSavingsProducts(controller.signal), getInvestmentAssets(controller.signal)])
      .then(async ([productData, assetData]) => {
        if (!active) return
        const draft = loadDraft()
        const bankCode = productData.products.some((product) => product.bankCode === draft.plan.currentBankCode)
          ? draft.plan.currentBankCode!
          : productData.products[0]?.bankCode ?? ''
        const assetCodes = assetData.assets.map((asset) => asset.code)
        setProducts(productData)
        setAssets(assetData)
        setSelectedBank(bankCode)
        setSelectedAssets(assetCodes)
        if (bankCode && assetCodes.length) setResult(await requestComparison(productData, bankCode, assetCodes))
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        if (active) setError(cause instanceof Error ? cause.message : '비교 결과를 불러오지 못했습니다.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false; controller.abort() }
  }, [])

  function toggleAsset(code: string) {
    setResult(null)
    setSelectedAssets((current) => current.includes(code)
      ? current.filter((item) => item !== code)
      : [...current, code])
  }

  async function submit() {
    if (!products || !selectedBank || selectedAssets.length === 0) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      setResult(await requestComparison(products, selectedBank, selectedAssets))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '비교 결과를 계산하지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="page page--wide alternatives-page">
      <p className="eyebrow">Alternatives</p>
      <h1>같은 돈, 다른 선택</h1>
      <p className="lead">내 월별 납입 순서를 적금 만기 계산과 과거 ETF 시나리오에 똑같이 적용합니다.</p>

      {products && assets && <div className="alternative-controls">
        <label>비교할 적금
          <select value={selectedBank} onChange={(event) => { setSelectedBank(event.target.value); setResult(null) }}>
            {products.products.map((product) => <option key={product.bankCode} value={product.bankCode}>{product.bankName}</option>)}
          </select>
        </label>
        <fieldset>
          <legend>함께 볼 투자 대안</legend>
          <div className="asset-options">{assets.assets.map((asset) => <label key={asset.code}>
            <input type="checkbox" checked={selectedAssets.includes(asset.code)} onChange={() => toggleAsset(asset.code)} />
            <b>{asset.code === 'kosdaq150' ? '코스닥150' : asset.ticker}</b> {asset.leveraged && <span className="risk-tag">레버리지</span>}
          </label>)}</div>
        </fieldset>
        <button className="button" type="button" disabled={loading || selectedAssets.length === 0} onClick={submit}>{loading ? '계산 중...' : '같은 현금흐름으로 비교하기'}</button>
      </div>}

      {selectedAssets.length === 0 && assets && <p className="field-error">비교할 투자 대안을 하나 이상 선택해 주세요.</p>}
      {error && <p className="notice notice--error">{error}</p>}
      {loading && !error && <p className="notice">적금과 과거 투자 결과를 계산하는 중입니다.</p>}

      {result && <>
        <div className="comparison-disclaimer">
          <strong>과거 시나리오 · 순위나 추천이 아닙니다</strong>
          <span>{result.notice}</span>
          <span>ETF 자료 기간: {result.startMonth} ~ {result.endMonth} · 배당 재투자 {result.dividendsReinvested ? '반영' : '미반영'}</span>
        </div>
        <div className="alternative-results">
          {result.results.map((item) => <article key={`${item.kind}-${item.code}`} className={`alternative-card ${item.leveraged ? 'alternative-card--risk' : ''}`}>
            <header>
              <span>{item.kind === 'savings' ? '청년미래적금' : '과거 ETF'}</span>
              <h2>{item.ticker === '229200.KS' ? 'KODEX 코스닥150' : item.ticker ?? item.name}</h2>
              {item.ticker && <small>{item.name}</small>}
            </header>
            <dl>
              <div><dt>총 납입원금</dt><dd>{money.format(item.principal)}원</dd></div>
              <div><dt>{item.kind === 'savings' ? '예상 만기액' : '기간 종료 평가액'}</dt><dd>{money.format(item.endingValue)}원</dd></div>
              <div><dt>원금 대비 증감</dt><dd className={item.profitLoss < 0 ? 'difference--minus' : 'difference--plus'}>{item.profitLoss > 0 ? '+' : ''}{money.format(item.profitLoss)}원</dd></div>
              <div><dt>원금 대비 비율</dt><dd>{item.returnPercent > 0 ? '+' : ''}{item.returnPercent}%</dd></div>
              {item.maxDrawdownPercent !== null && <div><dt>기간 중 최대 낙폭</dt><dd className="difference--minus">{item.maxDrawdownPercent}%</dd></div>}
            </dl>
            <div className="assumption-list">
              <span>{item.taxTreatment}</span><span>{item.feeTreatment}</span><span>{item.fxTreatment}</span>
            </div>
            <p className="risk-warning">{item.warning}</p>
            <a href={item.sourceUrl} target="_blank" rel="noreferrer">출처 확인 · {item.sourceDate}</a>
          </article>)}
        </div>
        <div className="actions"><Link className="button button--secondary" to="/cashflow">월별 납입액 수정하기</Link></div>
      </>}
    </section>
  )
}
