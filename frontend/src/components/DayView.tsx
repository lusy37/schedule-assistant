import { useEffect, useMemo, useState } from 'react'
import { MapPin } from 'lucide-react'
import type { Schedule } from '../types'
import { DAY_END_HOUR, DAY_START_HOUR, HOUR_HEIGHT, currentTimeTop, formatTimeRange, positionDaySchedules } from '../lib/calendar'

interface DayViewProps {
  date: Date
  schedules: Schedule[]
  onOpenSchedule: (schedule: Schedule) => void
  onCreateAt: (date: Date) => void
}

export function DayView({ date, schedules, onOpenSchedule, onCreateAt }: DayViewProps) {
  const hours = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }, (_, index) => DAY_START_HOUR + index)
  const positioned = useMemo(() => positionDaySchedules(schedules, date), [schedules, date])
  const [now, setNow] = useState(() => new Date())
  const currentTop = currentTimeTop(date, now)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const createAtPosition = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    const minutes = Math.round((event.nativeEvent.offsetY / HOUR_HEIGHT) * 2) * 30
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), DAY_START_HOUR)
    start.setMinutes(Math.max(0, Math.min(minutes, (DAY_END_HOUR - DAY_START_HOUR) * 60 - 30)))
    onCreateAt(start)
  }

  return (
    <div className="day-view">
      <div className="timeline-hours" aria-hidden="true">
        {hours.map((hour) => <span key={hour} style={{ top: (hour - DAY_START_HOUR) * HOUR_HEIGHT - 7 }}>{`${String(hour).padStart(2, '0')}:00`}</span>)}
      </div>
      <div className="timeline-grid" style={{ height: (DAY_END_HOUR - DAY_START_HOUR) * HOUR_HEIGHT }} onDoubleClick={createAtPosition}>
        {hours.slice(0, -1).map((hour) => <div key={hour} className="timeline-line" data-hour={hour} style={{ top: (hour - DAY_START_HOUR) * HOUR_HEIGHT }} />)}
        {currentTop !== null && <div className="current-time" style={{ top: currentTop }}><span /></div>}
        {positioned.map(({ schedule, top, height, left, width }) => (
          <button
            key={schedule.id}
            className={`schedule-block ${height < 55 ? 'is-compact' : ''} ${schedule.status === 'completed' ? 'is-completed' : ''}`}
            style={{ top, height, left: `calc(${left}% + 4px)`, width: `calc(${width}% - 8px)`, '--schedule-color': schedule.color } as React.CSSProperties}
            onClick={() => onOpenSchedule(schedule)}
          >
            <strong>{schedule.title}</strong>
            <span>{formatTimeRange(schedule)}</span>
            {height >= 55 && schedule.location && <small><MapPin size={11} />{schedule.location}</small>}
          </button>
        ))}
      </div>
    </div>
  )
}
