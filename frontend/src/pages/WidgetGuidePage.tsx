import { useState } from 'react'
import { Link } from 'react-router-dom'

// 대학·지자체 청년센터·핀테크 같은 다른 사이트에 계산기를 넣는 방법. 미리보기는 실제 위젯을 그대로 보여 준다.
export function WidgetGuidePage() {
  const origin = window.location.origin
  const [copied, setCopied] = useState('')
  const iframeCode = `<iframe src="${origin}/embed/savings?amount=300000&type=general" title="청년미래적금 예상 만기액 계산기" width="100%" height="560" style="border:1px solid #ccc" loading="lazy"></iframe>`
  const apiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'
  const apiCode = `fetch('${apiBase}/api/v1/public/savings-estimate?monthlyAmount=300000&contributionType=general')
  .then((response) => response.json())
  .then((data) => console.log(data.banks))`

  async function copy(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
    } catch {
      setCopied('')
    }
  }

  return (
    <section className="page page--wide">
      <p className="eyebrow">Widget</p>
      <h1>계산기 위젯 넣기</h1>
      <p className="lead">대학, 청년센터, 금융 정보 사이트에 청년미래적금 예상 만기액 계산기를 넣을 수 있어요. 숫자는 이 사이트와 같은 서버 계산으로 나와요.</p>

      <h2 className="section-title">1. 화면에 넣기(iframe)</h2>
      <p>아래 코드를 페이지에 붙여 넣으면 돼요. 주소의 <code>amount</code>(월 납입액, 1,000원 단위)와 <code>type</code>(<code>general</code>·<code>preferred</code>·<code>none</code>)으로 시작값을 정할 수 있어요.</p>
      <pre className="widget-code"><code>{iframeCode}</code></pre>
      <p><button type="button" className="button button--secondary" onClick={() => copy('iframe', iframeCode)}>코드 복사</button>{copied === 'iframe' && <span role="status"> 복사했어요.</span>}</p>
      <iframe className="widget-preview" src="/embed/savings?amount=300000&type=general" title="위젯 미리보기" loading="lazy" />

      <h2 className="section-title">2. 직접 불러오기(API)</h2>
      <p><code>GET /api/v1/public/savings-estimate</code>는 로그인 없이 어느 사이트에서든 부를 수 있어요. 은행별로 기본금리만 받을 때와 공시된 우대조건을 모두 채울 때의 예상 만기액을 은행 코드 순으로 돌려줘요.</p>
      <pre className="widget-code"><code>{apiCode}</code></pre>
      <p><button type="button" className="button button--secondary" onClick={() => copy('api', apiCode)}>코드 복사</button>{copied === 'api' && <span role="status"> 복사했어요.</span>}</p>

      <h2 className="section-title">지켜 주세요</h2>
      <ul>
        <li>예상치예요. 출처·기준일과 &ldquo;추천하지 않는다&rdquo;는 안내를 지우지 말고 함께 보여 주세요(위젯에는 들어 있어요).</li>
        <li>한 접속 주소에서 분당 60번, 하루 5,000번까지 부를 수 있어요. 많이 쓸 곳은 결과를 잠시 저장해 두고 쓰세요(금리는 공시가 바뀔 때만 바뀌어요).</li>
        <li>위젯과 API는 월 납입액과 기여금 유형만 받고 저장하지 않아요. 방문자 통계도 보내지 않아요.</li>
        <li>내 우대조건으로 정확히 계산하는 것은 <Link to="/conditions">내 조건</Link>에서 할 수 있어요.</li>
      </ul>
    </section>
  )
}
