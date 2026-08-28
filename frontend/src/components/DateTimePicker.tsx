import { useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react'
import { addMonths, format, isSameMonth } from 'date-fns'
import { dateKey, formatMonthHeading, isSameDay, monthGrid } from '../lib/calendar'

interface DateTimePickerProps {
  label: string
  value: string
  onChange: (value: string) => void
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

export function DateTimePicker({ label, value, onChange }: DateTimePickerProps) {
  const source = new Date(value)
  const [open, setOpen] = useState(() => (
    import.meta.env.DEV
    && label === '开始时间'
    && new URLSearchParams(window.location.search).get('preview') === 'picker'
  ))
  const [draft, setDraft] = useState(source)
  const [month, setMonth] = useState(new Date(source.getFullYear(), source.getMonth(), 1))
  const days = useMemo(() => monthGrid(month), [month])

  const openPicker = () => {
    const current = new Date(value)
    setDraft(current)
    setMonth(new Date(current.getFullYear(), current.getMonth(), 1))
    setOpen(true)
  }

  const selectDay = (day: Date) => {
    setDraft(new Date(day.getFullYear(), day.getMonth(), day.getDate(), draft.getHours(), draft.getMinutes()))
  }

  const changePart = (part: 'hour' | 'minute', raw: string) => {
    const next = new Date(draft)
    const number = Number(raw)
    if (part === 'hour') next.setHours(Math.max(0, Math.min(23, number)))
    else next.setMinutes(Math.max(0, Math.min(59, number)))
    setDraft(next)
  }

  return (
    <div className="date-time-field">
      <label>{label}</label>
      <button type="button" className="date-time-field__button" onClick={openPicker}>
        <CalendarDays size={17} />
        <span>{format(source, 'yyyy年M月d日')}</span>
        <Clock3 size={16} />
        <strong>{format(source, 'HH:mm')}</strong>
      </button>
      {open && (
        <div className="picker-popover">
          <div className="picker-popover__header">
            <strong>{formatMonthHeading(month)}</strong>
            <div>
              <button type="button" onClick={() => setMonth(addMonths(month, -1))} title="上个月"><ChevronLeft size={16} /></button>
              <button type="button" onClick={() => setMonth(addMonths(month, 1))} title="下个月"><ChevronRight size={16} /></button>
            </div>
          </div>
          <div className="picker-weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
          <div className="picker-grid">
            {days.map((day) => (
              <button
                type="button"
                key={dateKey(day)}
                className={`${!isSameMonth(day, month) ? 'is-outside' : ''} ${isSameDay(day, draft) ? 'is-selected' : ''}`}
                onClick={() => selectDay(day)}
              >{day.getDate()}</button>
            ))}
          </div>
          <div className="picker-time">
            <Clock3 size={16} />
            <input aria-label="小时" type="number" min="0" max="23" value={draft.getHours()} onChange={(event) => changePart('hour', event.target.value)} />
            <span>:</span>
            <input aria-label="分钟" type="number" min="0" max="59" step="5" value={draft.getMinutes()} onChange={(event) => changePart('minute', event.target.value)} />
          </div>
          <div className="picker-actions">
            <button type="button" className="button button--ghost" onClick={() => setOpen(false)}>取消</button>
            <button type="button" className="button button--primary" onClick={() => { onChange(draft.toISOString()); setOpen(false) }}>确定</button>
          </div>
        </div>
      )}
    </div>
  )
}
