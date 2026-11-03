import { track } from '../features/analytics'
import { buildMaturityIcs, buildMonthlyCheckIcs, CHECK_DAY, downloadIcs, REMINDER_DAYS } from '../features/maturityCalendar'

interface Props {
  startMonth: string
  termMonths: number
  bankName: string
  productName: string
  matured: boolean
}

// Calendar files made in the browser from the savings on this screen: one for the maturity month and one that repeats
// every month to check the bonus-rate conditions. Nothing is sent anywhere.
export function MyReminders({ startMonth, termMonths, bankName, productName, matured }: Props) {
  const plan = { startMonth, termMonths, bankName, productName }
  const monthlyAvailable = !matured && buildMonthlyCheckIcs(plan) !== null

  function download(content: string | null, fileName: string) {
    if (!content) return
    downloadIcs(content, fileName)
    track('download_reminder')
  }

  return <section className="my-savings__card" aria-labelledby="my-savings-reminders">
    <h2 id="my-savings-reminders">캘린더 알림 받기</h2>
    <div className="actions">
      {!matured && <button type="button" className="button button--secondary" onClick={() => download(buildMaturityIcs(plan), 'very-rich-maturity.ics')}>만기 알림(.ics)</button>}
      {monthlyAvailable && <button type="button" className="button button--secondary" onClick={() => download(buildMonthlyCheckIcs(plan), 'very-rich-condition-check.ics')}>매달 우대조건 확인 알림(.ics)</button>}
    </div>
    <p className="my-savings__muted">
      {!matured && `만기 알림은 만기 달 ${REMINDER_DAYS}일 전에 알려 줘요. `}
      {monthlyAvailable && `매달 확인 알림은 남은 납입 달마다 ${CHECK_DAY}일 아침 9시에 알려 줘요. `}
      휴대폰·구글·아웃룩 캘린더에서 열어 주세요. 파일은 이 기기에서만 만들고 어디에도 보내지 않아요. 정확한 만기일은 가입한 은행에서 확인해 주세요.
    </p>
  </section>
}
