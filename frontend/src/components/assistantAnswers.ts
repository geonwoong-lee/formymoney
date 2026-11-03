export interface AssistantLink {
  to: string
  label: string
}

export interface AssistantAnswer {
  text: string
  links: AssistantLink[]
  /** True when a model wrote the text; the bubble then shows a "may be wrong" notice. */
  ai?: boolean
  notice?: string
  /** Knowledge chunks the AI answer cites. */
  sources?: AssistantSource[]
}

export interface AssistantSource {
  title: string
  url?: string | null
  publishedOn?: string | null
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
  { to: '/maturity', label: '만기 후 계획' },
  { to: '/my-savings', label: '내 적금' },
  { to: '/daily', label: '오늘의 머니' },
  { to: '/market', label: '시장 지표' },
  { to: '/about', label: '계산 기준' },
]

export interface LocalAnswer extends AssistantAnswer {
  recommendation?: boolean
}

// The first matching rule wins, so the more specific topics come first.
const RULES: AnswerRule[] = [
  {
    keywords: ['추천', '뭐가 좋', '어디가 좋', '사야', '가입해야', '가입할까', '수익 보장'],
    text: '저는 특정 상품을 추천하거나 가입을 권하지 않아요. 같은 기준으로 계산해서 비교하는 것만 도와드려요.',
    links: [{ to: '/banks', label: '은행 비교 보기' }, { to: '/about', label: '계산 기준 보기' }],
  },
  {
    keywords: ['예금자보호', '예금자 보호', '보호 한도', '보호받', '보호돼', '보호 돼'],
    text: '예금자보호는 한 금융회사에서 한 사람당 원금과 이자를 합쳐 1억 원까지예요. 넘는 금액은 여러 금융회사에 나눠 맡기면 각각 보호받을 수 있어요. 보호 대상 상품인지는 가입 전에 상품 설명서에서 확인해 주세요.',
    links: [{ to: '/maturity', label: '만기 후 계획' }],
  },
  {
    keywords: ['내 적금', '몇 회차', '회차', '지금까지 넣은', '얼마나 넣었', '진행 상황', '놓친 납입'],
    text: '내 적금에서 지금 몇 회차인지, 만기에 받을 예상 금액, 지금까지 넣은 돈과 건너뛴 회차, 우대조건 상태를 한 화면에 볼 수 있어요.',
    links: [{ to: '/my-savings', label: '내 적금' }],
  },
  {
    keywords: ['만기 후', '만기되', '만기 되', '목돈', '재예치', '성향', '안정형', '공격형', '중립형', '만기 알림', '정기예금', '예금 상품'],
    text: '만기 후 계획에서 성향을 먼저 고르면, 목돈을 예금에 다시 맡길 때와 채권·주식 ETF에 넣을 때를 같은 금액·기간으로 나란히 볼 수 있어요. 지금 공시된 정기예금마다 세후로 받는 돈도 계산해 보여 드려요. 만기 30일 전 캘린더 알림도 받을 수 있어요.',
    links: [{ to: '/maturity', label: '만기 후 계획' }],
  },
  {
    keywords: ['해지', '깨', '중도'],
    text: '해지하기 전에 월별 납입 계획에서 이번 달만 덜 넣거나 건너뛰었을 때 만기 금액이 얼마나 달라지는지 먼저 계산해 볼 수 있어요. 해지할 때 받는 돈은 가입한 은행에서 확인해 주세요.',
    links: [{ to: '/cashflow', label: '월별 납입 계획' }],
  },
  {
    keywords: ['물가', '환율', '코스피', '코스닥', '증시', '국고채', '지표'],
    text: '시장 지표에서 환율, 증시, 금리, 소비자물가 상승률을 한국은행 공식 통계로 볼 수 있어요. 하루 한 번 갱신하는 지난 값이에요.',
    links: [{ to: '/market', label: '시장 지표' }],
  },
  {
    keywords: ['일정', '금통위', 'fomc', '발표일', '선거', '언제'],
    text: '오늘의 머니의 일정 탭에서 금통위, 미국 FOMC, 물가 발표, 선거 같은 공식 일정을 D-day로 볼 수 있어요.',
    links: [{ to: '/daily?tab=events', label: '다가올 일정' }],
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
    text: '로그인하면 내 정보의 저장한 계획에서 지금 입력을 이름 붙여 저장하고, 다른 기기에서 불러올 수 있어요. 로그인 없이도 계산은 해볼 수 있어요.',
    links: [{ to: '/auth', label: '로그인·회원가입' }, { to: '/me', label: '내 정보' }],
  },
]

export const GREETING = '무엇을 도와 드릴까요?'

// Shown as buttons before the first question so people see what the dog can answer.
export const EXAMPLE_QUESTIONS = [
  '이번 달 적금 못 넣으면 어떻게 돼?',
  '적금 만기되면 목돈은 어디에 둬?',
  '요즘 물가 얼마나 올랐어?',
  '다음 금통위 언제야?',
  '예금자보호는 얼마까지 돼?',
]
export const FALLBACK: AssistantAnswer = {
  text: '잘 모르겠어요. 이런 걸 도와드릴 수 있어요. 궁금한 걸 골라 보세요.',
  links: QUICK_LINKS,
}

export function findAnswer(query: string): LocalAnswer {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return FALLBACK
  const rule = RULES.find((entry) => entry.keywords.some((keyword) => normalized.includes(keyword)))
  return rule ? { text: rule.text, links: rule.links, recommendation: rule === RULES[0] } : FALLBACK
}
