import type { RiskProfile } from '../api/client'

export const PROFILES: { key: RiskProfile; label: string; description: string }[] = [
  { key: 'stable', label: '안정형', description: '원금이 줄어드는 게 가장 싫어요. 덜 벌어도 괜찮아요.' },
  { key: 'balanced', label: '중립형', description: '조금 흔들려도 되지만 크게 잃는 건 싫어요.' },
  { key: 'aggressive', label: '공격형', description: '한동안 손해를 봐도 기다릴 수 있어요.' },
]

// Each answer scores 0..2; the total picks a profile. A plain self-check, not a regulated suitability test.
export const PROFILE_QUESTIONS: { text: string; choices: [string, string, string] }[] = [
  { text: '1년 뒤 넣은 돈이 10% 줄어 있다면?', choices: ['견디기 어려워요', '불안하지만 기다려 봐요', '괜찮아요'] },
  { text: '이 돈은 언제 쓸 예정이에요?', choices: ['1년 안에', '1~3년 사이에', '3년 넘게 안 써도 돼요'] },
  { text: '투자해 본 경험은?', choices: ['예금·적금만 해 봤어요', '펀드·ETF를 조금 해 봤어요', '주식·ETF를 자주 해요'] },
]

export function profileFromAnswers(scores: number[]): RiskProfile {
  const total = scores.reduce((sum, score) => sum + score, 0)
  return total <= 1 ? 'stable' : total <= 4 ? 'balanced' : 'aggressive'
}
