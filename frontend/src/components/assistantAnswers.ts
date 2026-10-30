export interface AssistantLink {
  to: string
  label: string
}

export interface AssistantAnswer {
  text: string
  links: AssistantLink[]
}

interface AnswerRule {
  keywords: string[]
  text: string
  links: AssistantLink[]
}

export const QUICK_LINKS: AssistantLink[] = [
  { to: '/conditions', label: '내 조건 입력' },
  { to: '/banks', label: '은행 비교' },
  { to: '/cashflow', label: '월별 납입 계획' },
  { to: '/alternatives', label: '대안 비교' },
  { to: '/daily', label: '오늘의 머니' },
  { to: '/about', label: '계산 기준' },
]

// The first matching rule wins, so the more specific topics come first.
const RULES: AnswerRule[] = [
  {
    keywords: ['추천', '뭐가 좋', '어디가 좋', '사야', '가입해야', '가입할까', '수익 보장', '확실'],
    text: '저는 특정 상품을 추천하거나 가입을 권하지 않아요. 같은 기준으로 계산해서 비교하는 것만 도와드려요.',
    links: [{ to: '/banks', label: '은행 비교 보기' }, { to: '/about', label: '계산 기준 보기' }],
  },
  {
    keywords: ['납입', '감액', '빠뜨', '밀렸', '못 넣', '이번 달', '월별', '달마다', '넣은'],
    text: '월별 납입 계획에서 달마다 넣은 금액을 입력하면, 빠뜨린 달을 반영해서 만기 금액을 다시 계산해요.',
    links: [{ to: '/cashflow', label: '월별 납입 계획' }],
  },
  {
    keywords: ['청년미래적금', '우대', '조건', '자격', '가입 의향', '내 정보'],
    text: '내 조건 입력에서 우대 조건을 하나씩 체크하면, 내가 실제로 받을 수 있는 금리를 계산해요. 모르는 조건은 "모르겠어요"로 두어도 돼요.',
    links: [{ to: '/conditions', label: '내 조건 입력' }],
  },
  {
    keywords: ['은행', '금리', '비교', '어디', '이자'],
    text: '은행 비교에서 은행별 최고금리가 아니라 내 조건으로 받을 수 있는 금리를 나란히 볼 수 있어요.',
    links: [{ to: '/banks', label: '은행 비교' }],
  },
  {
    keywords: ['대안', '투자', 'etf', '주식', '같은 돈', '다른 선택', '나스닥'],
    text: '대안 비교는 같은 돈을 적금이 아닌 다른 선택에 넣었을 때 과거에 어땠는지를 보여줘요. 미래 수익을 약속하는 건 아니에요.',
    links: [{ to: '/alternatives', label: '대안 비교' }],
  },
  {
    keywords: ['뉴스', '오늘', '용어', '금융용어', '소식', '헤드라인'],
    text: '오늘의 머니에서 오늘의 금융용어와 주요 경제 뉴스를 볼 수 있어요. 뉴스는 제목과 링크 중심이고, 해외 뉴스는 AI가 한국어로 옮긴 거예요.',
    links: [{ to: '/daily', label: '오늘의 머니' }],
  },
  {
    keywords: ['기준', '계산', '출처', '틀', '오류', '믿', '공식'],
    text: '계산 기준 및 출처에서 어떤 공식 자료로 어떻게 계산하는지, 확인한 날짜는 언제인지 볼 수 있어요.',
    links: [{ to: '/about', label: '계산 기준' }],
  },
  {
    keywords: ['로그인', '회원', '가입', '계정', '마이', '저장'],
    text: '로그인하면 입력한 조건을 내 정보에서 다시 볼 수 있어요. 로그인 없이도 계산은 해볼 수 있어요.',
    links: [{ to: '/auth', label: '로그인·회원가입' }, { to: '/me', label: '내 정보' }],
  },
]

export const GREETING = '무엇을 도와 드릴까요?'
export const FALLBACK: AssistantAnswer = {
  text: '잘 모르겠어요. 이런 걸 도와드릴 수 있어요. 궁금한 걸 골라 보세요.',
  links: QUICK_LINKS,
}

export function findAnswer(query: string): AssistantAnswer {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return FALLBACK
  const rule = RULES.find((entry) => entry.keywords.some((keyword) => normalized.includes(keyword)))
  return rule ? { text: rule.text, links: rule.links } : FALLBACK
}
