import { useState } from 'react'
import type { SavingsCalculationResponse } from '../api/client'
import { track } from '../features/analytics'
import { sharedPlanFromDraft, shareUrl } from '../features/share'
import { downloadCanvas, drawResultCard } from '../features/shareImage'
import { loadDraft } from '../storage/draftStorage'

// Share the comparison as a link (inputs only, recalculated by whoever opens it) or as an image made in the browser.
export function ShareResult({ result }: { result: SavingsCalculationResponse }) {
  const [note, setNote] = useState('')

  async function shareLink() {
    const url = shareUrl(sharedPlanFromDraft(loadDraft()))
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: 'Very Rich? 은행 비교', text: '내 조건으로 계산한 청년미래적금 은행 비교', url })
        setNote('공유했어요.')
      } else {
        await navigator.clipboard.writeText(url)
        setNote('링크를 복사했어요. 원하는 곳에 붙여 넣으세요.')
      }
      track('share_result')
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return  // the person closed the share sheet
      setNote(`링크를 복사하지 못했어요. 이 주소를 직접 복사해 주세요: ${url}`)
    }
  }

  function saveImage() {
    const canvas = drawResultCard(result)
    if (!canvas) {
      setNote('이 브라우저에서는 이미지를 만들 수 없어요.')
      return
    }
    downloadCanvas(canvas, 'very-rich-bank-comparison.png')
    track('share_result')
    setNote('이미지를 저장했어요.')
  }

  return <section className="share-result" aria-labelledby="share-result-title">
    <h2 id="share-result-title" className="section-title">결과 공유하기</h2>
    <div className="actions">
      <button type="button" className="button button--secondary" onClick={shareLink}>링크로 공유</button>
      <button type="button" className="button button--secondary" onClick={saveImage}>이미지로 저장</button>
    </div>
    {note && <p className="source-note" role="status">{note}</p>}
    <p className="source-note">링크에는 월 납입액, 기여금 유형, 고른 은행, 우대조건 답(예/아니오)만 들어가요. 이름이나 연락처, 로그인 정보는 담기지 않으며, 링크를 연 사람의 화면에서 같은 조건으로 다시 계산해요. 이미지는 이 기기에서만 만들어요.</p>
  </section>
}
