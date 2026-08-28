import { format } from 'date-fns'
import type { Schedule } from '../types'
import { formatTimeRange, isSameDay, schedulesForDay, weekGrid } from '../lib/calendar'

interface WeekViewProps {
  date: Date
  schedules: Schedule[]
  onSelectDate: (date: Date) => void
  onOpenSchedule: (schedule: Schedule) => void
}

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

export function WeekView({ date, schedules, onSelectDate, onOpenSchedule }: WeekViewProps) {
  return (
    <div className="week-view">
      {weekGrid(date).map((day, index) => (
        <section key={day.toISOString()} className={`week-column ${isSameDay(day, new Date()) ? 'is-today' : ''}`}>
          <button className="week-column__header" onClick={() => onSelectDate(day)}>
            <span>{WEEKDAYS[index]}</span><strong>{format(day, 'd')}</strong>
          </button>
          <div className="week-column__items">
            {schedulesForDay(schedules, day).map((schedule) => (
              <button
                key={schedule.id}
                className={`week-item ${schedule.status === 'completed' ? 'is-completed' : ''}`}
                style={{ '--schedule-color': schedule.color } as React.CSSProperties}
                onClick={() => onOpenSchedule(schedule)}
              >
                <time>{formatTimeRange(schedule)}</time>
                <strong>{schedule.title}</strong>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
