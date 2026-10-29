import { useEffect, useState } from 'react'
import {
  getInvestmentAssets,
  getSavingsProducts,
  type InvestmentAssetsResponse,
  type SavingsProductsResponse,
} from '../api/client'

const SURVEY_URL = 'https://www.consumerinsight.co.kr/up_files/2606_finance.pdf'

interface ReferenceData {
  products: SavingsProductsResponse
  investments: InvestmentAssetsResponse
}

export function AboutPage() {
  const [references, setReferences] = useState<ReferenceData | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    Promise.all([
      getSavingsProducts(controller.signal),
      getInvestmentAssets(controller.signal),
    ])
      .then(([products, investments]) => {
        if (active) setReferences({ products, investments })
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        if (active) setError(cause instanceof Error ? cause.message : '출처를 불러오지 못했습니다.')
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [attempt])

  return (
    <section className="page page--wide about-page">
      <p className="eyebrow">About</p>
      <h1>계산 기준과 출처</h1>
      <p className="lead">결과를 어떻게 계산했는지, 어떤 자료를 사용했고 무엇을 반영하지 않았는지 공개합니다.</p>

      <div className="about-warning" role="note">
        <strong>의사결정 참고 자료입니다.</strong>
        <span>특정 금융상품의 가입·매수·매도를 추천하거나 미래 수익을 보장하지 않습니다.</span>
      </div>

      <section className="reference-section" aria-labelledby="survey-heading">
        <h2 id="survey-heading">1. 문제를 확인한 설문</h2>
        <dl className="reference-facts">
          <div><dt>조사 대상</dt><dd>전국 만 20~34세 금융소비자 266명</dd></div>
          <div><dt>조사 기간</dt><dd>2026년 6월 1일~12일</dd></div>
          <div><dt>사용 범위</dt><dd>사용자 문제 검증에만 사용</dd></div>
        </dl>
        <p>가입 의향 43%, 가입 유보 32%, 조건이 좋으면 새 은행을 고려한다는 응답 73%를 서비스 문제의 근거로 사용했습니다. 이는 실제 가입 행동이나 상품 수익의 근거가 아닙니다.</p>
        <p className="reference-caution">전체 조사 표본은 266명입니다. 세부 문항의 응답 대상과 분모는 원문 표기를 우선 확인하며, 복수응답 비율을 더해 전체 비율처럼 사용하지 않습니다.</p>
        <a href={SURVEY_URL} target="_blank" rel="noreferrer">컨슈머인사이트 금융플랫폼 기획조사 원문</a>
      </section>

      <section className="reference-section" aria-labelledby="savings-method-heading">
        <h2 id="savings-method-heading">2. 적금 계산 방법</h2>
        <ol className="method-list">
          <li><b>예상금리</b>: 기본금리에 사용자가 충족한다고 답한 우대금리만 더합니다. `모름`과 추가 확인이 필요한 조건은 더하지 않으며 최고금리를 넘지 않습니다.</li>
          <li><b>적금 이자</b>: 매월 납입한 원금에 예상 연이율과 만기까지 남은 개월 수를 적용해 월 단위로 합산하고 원 단위로 반올림합니다.</li>
          <li><b>정부기여금</b>: 월 납입액에 선택한 기여율을 적용합니다. 기여금 이자는 상품 기본금리와 남은 개월 수로 계산합니다.</li>
          <li><b>예상 만기액</b>: 납입원금 + 적금 이자 + 정부기여금 + 기여금 이자를 합산합니다.</li>
        </ol>
        {references && <p className="reference-summary">
          현재 기준: {references.products.policy.termMonths}개월 · 월 {references.products.policy.minimumMonthlyAmount.toLocaleString('ko-KR')}원~{references.products.policy.maximumMonthlyAmount.toLocaleString('ko-KR')}원 · 일반형 기여율 {references.products.policy.generalContributionRate}% · 우대형 기여율 {references.products.policy.preferredContributionRate}% · 비과세 {references.products.policy.taxExempt ? '반영' : '미반영'}
        </p>}
      </section>

      <section className="reference-section" aria-labelledby="investment-method-heading">
        <h2 id="investment-method-heading">3. 투자 과거 시나리오 계산 방법</h2>
        <ol className="method-list">
          <li>적금에 사용한 것과 같은 월별 금액을 각 월의 조정주가로 나눠 소수점 단위로 매수했다고 가정합니다.</li>
          <li>미국 자산은 각 월의 원/달러 환율을 반영하고, 원화 자산은 환율을 적용하지 않습니다.</li>
          <li>마지막 달의 조정주가와 환율로 종료 평가액을 계산합니다. 조정주가를 사용하므로 분배금 재투자가 반영됩니다.</li>
          <li>최대 낙폭은 사용한 가격·환율 시계열이 이전 고점에서 가장 크게 하락한 비율입니다.</li>
          <li>QLD는 QQQ 수익률에 2를 곱하지 않고 QLD의 실제 월별 자료를 사용합니다. 일간 2배 상품이므로 장기 성과는 단순 2배가 아닙니다.</li>
        </ol>
        {references && <p className="reference-summary">
          공통 설정: 세금 {references.investments.taxIncluded ? '반영' : '미반영'} · 증권사 거래 수수료 {references.investments.tradingFeeIncluded ? '반영' : '미반영'} · 미국 자산 환율 {references.investments.fxIncluded ? '반영' : '미반영'} · 소수점 매수 {references.investments.fractionalShares ? '가정' : '미가정'}
        </p>}
      </section>

      <section className="reference-section" aria-labelledby="sources-heading">
        <h2 id="sources-heading">4. 상품과 시장자료 출처</h2>
        {!references && !error && <p className="notice" aria-live="polite">공식 출처와 기준일을 불러오는 중입니다.</p>}
        {error && <div className="notice notice--error" role="alert">
          <p>{error} 계산 방법은 확인할 수 있지만, 현재 상품별 출처는 확인할 수 없습니다.</p>
          <button className="button button--small" type="button" onClick={() => {
            setError('')
            setReferences(null)
            setAttempt((value) => value + 1)
          }}>다시 불러오기</button>
        </div>}
        {references && <>
          <h3>청년미래적금 공식 공시</h3>
          <ul className="source-list">
            {references.products.products.map((product) => <li key={product.bankCode}>
              <span><b>{product.bankName}</b><small>{product.productName} · 기본 {product.baseRate}% / 최고 {product.maximumRate}%</small></span>
              {product.sourceUrl && product.sourceDate
                ? <a href={product.sourceUrl} target="_blank" rel="noreferrer">공시 원문 · {product.sourceDate}</a>
                : <em>출처 또는 기준일 확인 필요</em>}
            </li>)}
          </ul>

          <h3>투자 기준자료</h3>
          <ul className="source-list source-list--assets">
            {references.investments.assets.map((asset) => <li key={asset.code}>
              <span><b>{asset.ticker} · {asset.name}</b><small>{asset.startMonth}~{asset.endMonth} · 기준일 {asset.sourceDate || '확인 필요'} · ETF 보수 {asset.expenseRatioPercent}%</small></span>
              <span className="source-links">
                {asset.providerSourceUrl ? <a href={asset.providerSourceUrl} target="_blank" rel="noreferrer">운용사</a> : <em>운용사 링크 확인 필요</em>}
                {asset.priceSourceUrl ? <a href={asset.priceSourceUrl} target="_blank" rel="noreferrer">가격자료</a> : <em>가격 링크 확인 필요</em>}
                {asset.currency !== 'KRW' && (asset.fxSourceUrl ? <a href={asset.fxSourceUrl} target="_blank" rel="noreferrer">환율자료</a> : <em>환율 링크 확인 필요</em>)}
              </span>
            </li>)}
          </ul>
        </>}
      </section>

      <section className="reference-section" aria-labelledby="limits-heading">
        <h2 id="limits-heading">5. 반영하지 않은 요소와 한계</h2>
        <ul className="limit-list">
          <li>개인별 세금과 증권사 거래 수수료</li>
          <li>실제 주문 시점의 가격 차이와 매매 가능 여부</li>
          <li>은행의 최종 서류 심사와 추가 확인이 필요한 우대조건</li>
          <li>공시 이후 바뀐 금리·정책·상품 조건</li>
          <li>미래 시장가격과 환율 예측</li>
        </ul>
        <p className="reference-caution">계산 결과는 입력값과 현재 저장된 기준자료로 만든 예상치입니다. 가입 전 금융기관의 최신 공시를, 투자 전 각 운용사의 공식 위험 안내를 다시 확인하세요.</p>
      </section>
    </section>
  )
}
