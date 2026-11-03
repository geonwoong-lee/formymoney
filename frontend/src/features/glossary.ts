export interface GlossaryTerm {
  slug: string
  name: string
  meaning: string
  where: string  // where on this site the word shows up
  link?: { to: string; label: string }
}

// The words this site's numbers are built from, in plain language. Facts that a rule or an agency sets are stated
// the way they are published; anything that changes (limits, shares) points to the screen that holds the current value.
export const GLOSSARY: GlossaryTerm[] = [
  { slug: 'simple-interest', name: '단리', meaning: '맡긴 원금에만 이자가 붙는 방식이에요. 적금은 넣은 달부터 만기까지 달수만큼 이자가 쌓여서, 첫 달에 넣은 돈이 가장 오래 이자를 받아요.', where: '정기예금·적금 목록의 "단리"', link: { to: '/general-savings', label: '적금 찾기' } },
  { slug: 'compound-interest', name: '복리', meaning: '이자에도 이자가 붙는 방식이에요. 같은 금리라면 단리보다 만기에 받는 돈이 조금 더 많아요.', where: '목록의 "복리" 표시' },
  { slug: 'interest-tax', name: '이자소득세(15.4%)', meaning: '이자를 받을 때 떼는 세금이에요. 소득세 14%와 지방소득세 1.4%를 합친 15.4%예요. 이 사이트의 일반 적금·예금은 세금을 뗀 뒤 받는 돈(세후)으로 보여 줘요.', where: '"세후"로 표시된 모든 금액' },
  { slug: 'tax-free', name: '비과세', meaning: '이자에 세금을 매기지 않는 거예요. 청년미래적금은 이자소득이 비과세라서 세금을 떼지 않고 계산해요.', where: '내 조건·내 적금의 만기 금액', link: { to: '/conditions', label: '내 조건' } },
  { slug: 'financial-income-tax', name: '금융소득종합과세', meaning: '한 해 이자와 배당을 합친 돈이 2,000만 원을 넘으면 다른 소득과 합쳐서 세금을 매기는 제도예요. 이 경우 15.4%보다 세금이 커질 수 있어요. 이 사이트의 계산은 이 제도를 반영하지 않아요.', where: '일반 적금·정기예금 목록의 안내' },
  { slug: 'base-rate', name: '기본금리', meaning: '아무 조건도 채우지 않아도 받는 금리예요.', where: '목록의 "기본금리"' },
  { slug: 'bonus-rate', name: '우대금리', meaning: '급여 이체, 카드 사용 같은 조건을 채우면 기본금리에 더해 주는 금리예요. 조건을 못 채우면 받을 수 없어요.', where: '내 조건, 은행 비교, 내 적금의 우대조건', link: { to: '/conditions', label: '내 조건' } },
  { slug: 'max-rate', name: '최고금리', meaning: '모든 우대조건을 다 채웠을 때만 받는 금리예요. 이 사이트는 최고금리가 아니라 내가 채운 조건으로 받을 수 있는 금리를 계산해요.', where: '목록의 "우대 조건을 다 채우면"' },
  { slug: 'government-contribution', name: '정부기여금', meaning: '청년미래적금에 넣은 돈에 정부가 더해 주는 돈이에요. 소득과 가입 유형에 따라 비율이 다르고(2차 가입 기준 일반형 6%, 우대형 12%), 모집 때마다 바뀔 수 있어요.', where: '내 조건·내 적금의 만기 금액', link: { to: '/conditions', label: '자격 확인' } },
  { slug: 'median-income', name: '기준 중위소득', meaning: '보건복지부가 해마다 고시하는, 가구원 수별 월 소득의 중간값이에요. 청년미래적금은 가구소득이 이 금액의 몇 %인지로 가입 자격과 유형을 나눠요.', where: '자격 확인의 가구소득', link: { to: '/conditions', label: '자격 확인' } },
  { slug: 'fixed-reserve', name: '정액적립식·자유적립식', meaning: '정액적립식은 매달 정해진 금액을 넣는 적금, 자유적립식은 넣고 싶을 때 넣는 적금이에요.', where: '일반 적금 비교의 적립 방식', link: { to: '/general-savings', label: '적금 찾기' } },
  { slug: 'deposit-protection', name: '예금자보호', meaning: '금융회사가 망해도 한 금융회사에서 한 사람당 원금과 이자를 합쳐 1억 원까지 돌려받는 제도예요. 한도를 넘는 돈은 여러 금융회사에 나눠 맡기면 각각 보호받아요. 상품마다 보호 대상인지 다르니 가입 전에 확인해 주세요.', where: '만기 후 계획', link: { to: '/maturity', label: '만기 후 계획' } },
  { slug: 'bullet-repayment', name: '만기일시상환', meaning: '대출 기간 동안 이자만 내다가 만기에 원금을 한 번에 갚는 방식이에요. 매달 내는 돈은 적지만 원금은 그대로 남아요.', where: '전세자금대출 비교의 "월 이자"', link: { to: '/rent-loans', label: '전세대출' } },
  { slug: 'equal-payment', name: '분할상환(원리금균등)', meaning: '원금과 이자를 합쳐 매달 같은 금액을 내서 갚는 방식이에요. 처음엔 이자가 많고 갈수록 원금이 많아져서 총이자는 만기일시상환보다 적어요.', where: '전세자금대출 비교의 "월 상환액"', link: { to: '/rent-loans', label: '전세대출' } },
  { slug: 'guarantee', name: '보증기관', meaning: '전세대출을 받을 때 집주인에게 보증금을 돌려받지 못할 위험을 대신 맡는 곳이에요. 서울보증보험(SGI), 주택금융공사(HF), 주택도시보증공사(HUG)가 있어요. 기관마다 보증료와 대상이 달라요.', where: '전세자금대출 비교의 보증기관', link: { to: '/rent-loans', label: '전세대출' } },
  { slug: 'early-repay-fee', name: '중도상환수수료', meaning: '대출을 만기 전에 갚을 때 내는 수수료예요. 은행이 공시한 계산식을 펼쳐 볼 수 있어요.', where: '전세자금대출 목록의 펼침', link: { to: '/rent-loans', label: '전세대출' } },
  { slug: 'delay-rate', name: '연체 이자율', meaning: '갚을 날짜를 넘겼을 때 적용하는 이자율이에요. 보통 원래 금리에 몇 %p를 더해요.', where: '전세자금대출 목록의 펼침', link: { to: '/rent-loans', label: '전세대출' } },
  { slug: 'base-interest-rate', name: '한국은행 기준금리', meaning: '한국은행이 정하는 정책금리예요. 은행의 예금·대출 금리가 이를 따라 오르내리는 경향이 있어요. 이 사이트는 목록 위에 참고 숫자로만 보여 줘요.', where: '예금·적금 목록 위의 참고 줄' },
  { slug: 'inflation', name: '소비자물가 상승률', meaning: '1년 전보다 물가가 몇 % 올랐는지예요. 예금 금리가 이보다 낮으면 같은 돈으로 살 수 있는 물건이 줄어들 수 있어요.', where: '예금·적금 목록 위의 참고 줄' },
]
