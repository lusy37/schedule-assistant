import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isWithinInterval,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { zhCN } from 'date-fns/locale'
import type { Schedule } from '../types'

export const DAY_START_HOUR = 8
export const DAY_END_HOUR = 21
export const HOUR_HEIGHT = 61

export function dateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function monthGrid(month: Date): Date[] {
  const first = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
  const last = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
  const days: Date[] = []
  for (let cursor = first; cursor <= last; cursor = addDays(cursor, 1)) {
    days.push(cursor)
  }
  return days
}

export function weekGrid(date: Date): Date[] {
  const first = startOfWeek(date, { weekStartsOn: 1 })
  return Array.from({ length: 7 }, (_, index) => addDays(first, index))
}

export function schedulesForDay(schedules: Schedule[], date: Date): Schedule[] {
  return schedules
    .filter((schedule) => {
      const start = new Date(schedule.startAt)
      const end = new Date(schedule.endAt)
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate())
      const dayEnd = addDays(dayStart, 1)
      return start < dayEnd && end > dayStart
    })
    .sort((left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime())
}

export function daysWithSchedules(schedules: Schedule[]): Set<string> {
  const result = new Set<string>()
  schedules.forEach((schedule) => {
    const start = startOfDay(new Date(schedule.startAt))
    const end = startOfDay(new Date(new Date(schedule.endAt).getTime() - 1))
    for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
      result.add(dateKey(cursor))
    }
  })
  return result
}

export function formatTimeRange(schedule: Schedule): string {
  return `${format(new Date(schedule.startAt), 'HH:mm')} - ${format(new Date(schedule.endAt), 'HH:mm')}`
}

export function formatDayHeading(date: Date): string {
  return `${format(date, 'M月d日 EEEE', { locale: zhCN })} · 今日日程`.replace('星期', '周')
}

export function formatMonthHeading(date: Date): string {
  return format(date, 'yyyy年M月')
}

export function toDateTimeLocalValue(value: Date): string {
  return format(value, "yyyy-MM-dd'T'HH:mm")
}

export function roundToNextHalfHour(now: Date): Date {
  const result = new Date(now)
  result.setSeconds(0, 0)
  const minutes = result.getMinutes()
  if (minutes === 0 || minutes === 30) {
    result.setMinutes(minutes + 30)
  } else if (minutes < 30) {
    result.setMinutes(30)
  } else {
    result.setHours(result.getHours() + 1, 0, 0, 0)
  }
  return result
}

export function currentTimeTop(day: Date, now: Date): number | null {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), DAY_START_HOUR)
  const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), DAY_END_HOUR)
  if (now < dayStart || now >= dayEnd) return null
  return ((now.getTime() - dayStart.getTime()) / 3_600_000) * HOUR_HEIGHT
}

export interface PositionedSchedule {
  schedule: Schedule
  top: number
  height: number
  left: number
  width: number
}

interface TimelineItem {
  schedule: Schedule
  start: number
  end: number
}

export function positionDaySchedules(schedules: Schedule[], day: Date): PositionedSchedule[] {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), DAY_START_HOUR)
  const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), DAY_END_HOUR)
  const visible: TimelineItem[] = schedulesForDay(schedules, day)
    .map((schedule) => ({
      schedule,
      start: Math.max(new Date(schedule.startAt).getTime(), dayStart.getTime()),
      end: Math.min(new Date(schedule.endAt).getTime(), dayEnd.getTime()),
    }))
    .filter((item) => item.end > item.start)

  const result: PositionedSchedule[] = []
  let cluster: TimelineItem[] = []
  let clusterEnd = 0

  const flushCluster = () => {
    if (cluster.length === 0) return
    const columnEnds: number[] = []
    const assigned = cluster.map((item) => {
      let column = columnEnds.findIndex((end) => end <= item.start)
      if (column === -1) {
        column = columnEnds.length
        columnEnds.push(item.end)
      } else {
        columnEnds[column] = item.end
      }
      return { ...item, column }
    })
    const columns = Math.max(columnEnds.length, 1)
    assigned.forEach((item) => {
      const startMinutes = (item.start - dayStart.getTime()) / 60_000
      const durationMinutes = (item.end - item.start) / 60_000
      result.push({
        schedule: item.schedule,
        top: (startMinutes / 60) * HOUR_HEIGHT,
        height: (durationMinutes / 60) * HOUR_HEIGHT,
        left: (item.column / columns) * 100,
        width: 100 / columns,
      })
    })
    cluster = []
    clusterEnd = 0
  }

  visible.forEach((item) => {
    if (cluster.length > 0 && item.start >= clusterEnd) {
      flushCluster()
    }
    cluster.push(item)
    clusterEnd = Math.max(clusterEnd, item.end)
  })
  flushCluster()
  return result
}

export function occursInRange(schedule: Schedule, start: Date, end: Date): boolean {
  const scheduleStart = new Date(schedule.startAt)
  const scheduleEnd = new Date(schedule.endAt)
  return (
    isWithinInterval(scheduleStart, { start, end }) ||
    isWithinInterval(scheduleEnd, { start, end }) ||
    (scheduleStart < start && scheduleEnd > end)
  )
}

export { isSameDay }
