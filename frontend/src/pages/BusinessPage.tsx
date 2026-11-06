import { Link } from 'react-router-dom'

// 기업·제휴용 모음: 은행·핀테크·대학·청년센터 같은 곳이 이 서비스에서 가져다 쓰거나 참고할 수 있는 것을 한곳에 모았다.
export function BusinessPage() {
  return (
    <section className="page page--wide">
      <p className="eyebrow">For business</p>
      <h1>기업·제휴용</h1>
      <p className="lead">은행, 핀테크, 대학, 청년센터처럼 청년 적금을 안내하는 곳이 이 서비스에서 가져다 쓰거나 참고할 수 있는 것을 모았어요. 일반 이용자는 이 화면을 볼 필요가 없어요.</p>

      <h2 className="section-title">1. 우대조건 현황 — 고객이 어디서 막히는지 보기</h2>
      <p>방문자 중 통계에 동의한 사람이 은행 비교에서 고른 우대조건 답(채울 수 있다·없다·모르겠다)을 이름 없이 세어 은행·조건별 비율로 보여 줘요. 예를 들어 &ldquo;급여 이체 조건은 응답자의 몇 %가 채울 수 있다고 했다&rdquo;를 알 수 있어요. 어떤 조건이 고객에게 부담인지 알면 상품 설계나 안내에 쓸 수 있어요.</p>
      <p className="my-savings__muted">응답이 20건 미만이거나 어떤 답이 1~4건뿐이면 개인이 드러날 수 있어 숫자를 숨겨요. 지금은 쌓인 응답이 적어 대부분 비어 있어요.</p>
      <p><Link className="button button--secondary" to="/condition-stats">우대조건 현황 보기</Link></p>

      <h2 className="section-title">2. 계산기 위젯 — 우리 사이트에 계산기 붙이기</h2>
      <p>청년미래적금을 월 얼마 넣으면 만기에 얼마를 받는지 계산해 주는 작은 계산기예요. 내 사이트를 만드는 사람이 코드 한 줄을 붙여 넣으면 자기 페이지 안에 이 계산기가 그대로 나타나요. 계산기를 따로 만들지 않아도 되고, 숫자는 이 사이트와 같은 계산으로 나와요.</p>
      <p>계산기 화면 대신 숫자만 받아서 자기 화면에 직접 꾸며 보여 주고 싶으면 API(로그인 없이 부르는 주소)도 쓸 수 있어요. 코드 복사와 미리보기는 안내 화면에 있어요.</p>
      <p><Link className="button button--secondary" to="/widget">위젯 넣는 방법 보기</Link></p>
    </section>
  )
}
