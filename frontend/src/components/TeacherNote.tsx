import type { ReactNode } from 'react'
import teacherImage from '../assets/icons/finance-teacher.png'

// Styles live in DailyPage.css (.daily-teacher); every screen that uses it imports that sheet.
export function TeacherNote({ children }: { children: ReactNode }) {
  return <div className="daily-teacher">
    <img className="daily-teacher__face" src={teacherImage} alt="" width={96} height={96} />
    <div className="daily-teacher__bubble">
      <b className="daily-teacher__name">금융 선생님</b>
      {children}
    </div>
  </div>
}
