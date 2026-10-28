import { useParams } from 'react-router-dom'
import { PlaceholderPage } from './PlaceholderPage'

export function BankDetailPage() {
  const { bankId } = useParams()
  return <PlaceholderPage eyebrow="Bank detail" title="은행 상세" description={`선택한 은행(${bankId ?? '미지정'})의 조건과 계산 근거를 확인할 화면입니다.`} />
}
