import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addMonths, isSameMonth } from 'date-fns'
import { dateKey, formatMonthHeading, isSameDay, monthGrid } from '../lib/calendar'

interface MiniCalendarProps {
  selectedDate: Date
  markedDays: Set<string>
  onSelect: (date: Date) => void
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

export function MiniCalendar({ selectedDate, markedDays, onSelect }: MiniCalendarProps) {
  const [month, setMonth] = useState(() => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1))
  const days = useMemo(() => monthGrid(month), [month])

  useEffect(() => {
    setMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1))
  }, [selectedDate])

  return (
    <section className="mini-calendar" aria-label="日期选择">
      <div className="mini-calendar__header">
        <strong>{formatMonthHeading(month)}</strong>
        <div className="mini-calendar__nav">
          <button onClick={() => setMonth(addMonths(month, -1))} title="上个月" aria-label="上个月"><ChevronLeft size={16} /></button>
          <button onClick={() => setMonth(addMonths(month, 1))} title="下个月" aria-label="下个月"><ChevronRight size={16} /></button>
        </div>
      </div>
      <div className="mini-calendar__weekdays">
        {WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}
      </div>
      <div className="mini-calendar__grid">
        {days.map((day) => {
          const selected = isSameDay(day, selectedDate)
          const today = isSameDay(day, new Date())
          return (
            <button
              key={dateKey(day)}
              className={[
                'mini-calendar__day',
                !isSameMonth(day, month) ? 'is-outside' : '',
                selected ? 'is-selected' : '',
                today ? 'is-today' : '',
              ].join(' ')}
              onClick={() => onSelect(day)}
              aria-label={`${day.getMonth() + 1}月${day.getDate()}日`}
              aria-pressed={selected}
            >
              <span>{day.getDate()}</span>
              {markedDays.has(dateKey(day)) && <i aria-hidden="true" />}
            </button>
          )
        })}
      </div>
    </section>
  )
}
