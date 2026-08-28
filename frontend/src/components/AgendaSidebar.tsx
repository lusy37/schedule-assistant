import { Bell, Check, MapPin } from 'lucide-react'
import { format } from 'date-fns'
import type { Schedule } from '../types'
import { daysWithSchedules, formatTimeRange, schedulesForDay } from '../lib/calendar'
import { MiniCalendar } from './MiniCalendar'

interface AgendaSidebarProps {
  schedules: Schedule[]
  selectedDate: Date
  onSelectDate: (date: Date) => void
  onOpenSchedule: (schedule: Schedule) => void
  onToggleComplete: (schedule: Schedule) => void
}

export function AgendaSidebar({ schedules, selectedDate, onSelectDate, onOpenSchedule, onToggleComplete }: AgendaSidebarProps) {
  const daySchedules = schedulesForDay(schedules, selectedDate)
  return (
    <aside className="sidebar">
      <MiniCalendar selectedDate={selectedDate} markedDays={daysWithSchedules(schedules)} onSelect={onSelectDate} />
      <div className="agenda-header">
        <div>
          <span>{format(selectedDate, 'M月d日')}</span>
          <strong>日程</strong>
        </div>
        <span className="agenda-count">{daySchedules.length}</span>
      </div>
      <div className="agenda-list">
        {daySchedules.length === 0 && (
          <div className="agenda-empty"><Bell size={18} /><span>这一天还没有安排</span></div>
        )}
        {daySchedules.map((schedule) => (
          <article
            key={schedule.id}
            className={`agenda-item ${schedule.status === 'completed' ? 'is-completed' : ''}`}
            onClick={() => onOpenSchedule(schedule)}
          >
            <span className="agenda-item__bar" style={{ background: schedule.color }} />
            <div className="agenda-item__content">
              <time>{formatTimeRange(schedule)}</time>
              <strong>{schedule.title}</strong>
              {schedule.location && <span className="agenda-item__location"><MapPin size={12} />{schedule.location}</span>}
            </div>
            <button
              className="complete-button"
              onClick={(event) => { event.stopPropagation(); onToggleComplete(schedule) }}
              title={schedule.status === 'completed' ? '标记为未完成' : '标记为已完成'}
              aria-label={schedule.status === 'completed' ? '标记为未完成' : '标记为已完成'}
            >
              {schedule.status === 'completed' && <Check size={13} />}
            </button>
          </article>
        ))}
      </div>
    </aside>
  )
}
