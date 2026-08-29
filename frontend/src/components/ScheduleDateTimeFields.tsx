import { useCallback, useEffect, useRef, useState } from 'react'
import DatePicker from 'antd/es/date-picker'
import datePickerZhCN from 'antd/es/date-picker/locale/zh_CN'
import TimePicker from 'antd/es/time-picker'
import dayjs, { type Dayjs } from 'dayjs'
import 'dayjs/locale/zh-cn'
import { CalendarDays, Clock3 } from 'lucide-react'
import { DAY_END_HOUR, DAY_START_HOUR } from '../lib/calendar'

interface ScheduleDateTimeFieldsProps {
  startValue: string
  endValue: string
  dateEditable: boolean
  onChange: (startValue: string, endValue: string) => void
}

interface ScheduleTimePickerProps {
  kind: 'start' | 'end'
  value: string
  startValue: string
  previewOpen: boolean
  onCommit: (value: Dayjs) => void
}

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)
const MINUTES = Array.from({ length: 60 }, (_, minute) => minute)

function applyTime(dateValue: string, time: Dayjs) {
  return dayjs(dateValue)
    .hour(time.hour())
    .minute(time.minute())
    .second(0)
    .millisecond(0)
}

function ScheduleTimePicker({ kind, value, startValue, previewOpen, onCommit }: ScheduleTimePickerProps) {
  const [open, setOpen] = useState(previewOpen)
  const [draft, setDraft] = useState(() => dayjs(value))
  const draftRef = useRef(draft)
  const openRef = useRef(previewOpen)
  const fieldRef = useRef<HTMLDivElement>(null)
  const popupClassName = `schedule-time-picker-popup schedule-${kind}-time-popup`

  const updateDraft = (next: Dayjs) => {
    draftRef.current = next
    setDraft(next)
  }

  const commit = useCallback(() => {
    if (!openRef.current) return
    openRef.current = false
    if (draftRef.current.isValid()) onCommit(draftRef.current)
    setOpen(false)
  }, [onCommit])

  useEffect(() => {
    if (!open) updateDraft(dayjs(value))
  }, [open, value])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Element
      const insideField = fieldRef.current?.contains(target)
      const insidePopup = target.closest(`.schedule-${kind}-time-popup.ant-picker-dropdown`)
      if (!insideField && !insidePopup) commit()
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [commit, kind, open])

  const disabledHours = () => {
    if (kind === 'start') {
      return HOURS.filter((hour) => hour < DAY_START_HOUR || hour >= DAY_END_HOUR)
    }
    const start = dayjs(startValue)
    return HOURS.filter((hour) => (
      hour < DAY_START_HOUR
      || hour > DAY_END_HOUR
      || hour < start.hour()
      || (hour === start.hour() && start.minute() >= 55)
    ))
  }

  const disabledMinutes = (selectedHour: number) => {
    if (kind === 'start') return []
    const start = dayjs(startValue)
    if (selectedHour === DAY_END_HOUR) return MINUTES.filter((minute) => minute > 0)
    if (selectedHour === start.hour()) return MINUTES.filter((minute) => minute <= start.minute())
    return []
  }

  const handleCalendarChange = (next: Dayjs | Dayjs[]) => {
    const selected = Array.isArray(next) ? next[0] : next
    if (selected) updateDraft(selected)
  }

  return (
    <div className="schedule-single-time-field" ref={fieldRef}>
      <label className="visually-hidden" htmlFor={`schedule-${kind}-time`}>{kind === 'start' ? '开始时间' : '结束时间'}</label>
      <TimePicker
        id={`schedule-${kind}-time`}
        className="schedule-single-time-picker"
        rootClassName={popupClassName}
        value={draft}
        defaultOpen={previewOpen}
        locale={datePickerZhCN}
        format="HH:mm"
        placeholder={kind === 'start' ? '开始时间' : '结束时间'}
        variant="borderless"
        suffixIcon={null}
        allowClear={false}
        inputReadOnly
        needConfirm
        showNow={false}
        showSecond={false}
        minuteStep={5}
        hideDisabledOptions
        disabledTime={() => ({ disabledHours, disabledMinutes })}
        onCalendarChange={handleCalendarChange}
        onChange={(next) => {
          if (next) updateDraft(next)
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopPropagation()
          commit()
        }}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            updateDraft(dayjs(value))
            openRef.current = true
            setOpen(true)
          } else {
            commit()
          }
        }}
      />
    </div>
  )
}

export function ScheduleDateTimeFields({ startValue, endValue, dateEditable, onChange }: ScheduleDateTimeFieldsProps) {
  const previewPicker = import.meta.env.DEV
    ? new URLSearchParams(window.location.search).get('preview')
    : null

  const handleDateChange = (date: Dayjs | null) => {
    if (!date) return
    const start = dayjs(startValue)
    const end = dayjs(endValue)
    const nextStart = date.hour(start.hour()).minute(start.minute()).second(0).millisecond(0)
    const nextEnd = date.hour(end.hour()).minute(end.minute()).second(0).millisecond(0)
    onChange(nextStart.toDate().toISOString(), nextEnd.toDate().toISOString())
  }

  const handleStartTime = (time: Dayjs) => {
    const currentStart = dayjs(startValue)
    const currentEnd = dayjs(endValue)
    const nextStart = applyTime(startValue, time)
    let nextEnd = currentEnd
    if (!nextEnd.isAfter(nextStart)) {
      const previousDuration = Math.max(currentEnd.diff(currentStart), 5 * 60_000)
      const dayEnd = dayjs(startValue).hour(DAY_END_HOUR).minute(0).second(0).millisecond(0)
      nextEnd = nextStart.add(previousDuration, 'millisecond')
      if (nextEnd.isAfter(dayEnd)) nextEnd = dayEnd
    }
    onChange(nextStart.toDate().toISOString(), nextEnd.toDate().toISOString())
  }

  const handleEndTime = (time: Dayjs) => {
    const nextEnd = applyTime(startValue, time)
    if (nextEnd.isAfter(dayjs(startValue))) {
      onChange(startValue, nextEnd.toDate().toISOString())
    }
  }

  return (
    <div className="schedule-date-time-fields">
      <div className="schedule-date-field">
        <span className="schedule-date-time-fields__label">日期</span>
        {dateEditable ? (
          <>
            <label className="visually-hidden" htmlFor="schedule-date">日期</label>
            <DatePicker
              id="schedule-date"
              className="schedule-date-picker"
              rootClassName="schedule-date-picker-popup"
              value={dayjs(startValue)}
              locale={datePickerZhCN}
              format="YYYY年M月D日"
              prefix={<CalendarDays size={17} />}
              suffixIcon={null}
              allowClear={false}
              inputReadOnly
              needConfirm={false}
              onKeyDown={(event) => {
                if (event.key === 'Escape') event.stopPropagation()
              }}
              onChange={handleDateChange}
            />
          </>
        ) : (
          <div className="schedule-fixed-date" aria-label={`日期：${dayjs(startValue).locale('zh-cn').format('YYYY年M月D日 dddd')}`}>
            <CalendarDays size={17} />
            <strong>{dayjs(startValue).locale('zh-cn').format('YYYY年M月D日 dddd')}</strong>
          </div>
        )}
      </div>

      <div className="schedule-time-field">
        <span className="schedule-date-time-fields__label">开始与结束时间</span>
        <div className="schedule-time-range-control">
          <Clock3 className="schedule-time-range-control__icon" size={17} />
          <ScheduleTimePicker
            kind="start"
            value={startValue}
            startValue={startValue}
            previewOpen={previewPicker === 'picker'}
            onCommit={handleStartTime}
          />
          <span className="schedule-time-range-picker__separator">至</span>
          <ScheduleTimePicker
            kind="end"
            value={endValue}
            startValue={startValue}
            previewOpen={false}
            onCommit={handleEndTime}
          />
        </div>
      </div>
    </div>
  )
}
