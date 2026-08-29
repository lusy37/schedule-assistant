import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DayView } from './DayView'
import { WeekView } from './WeekView'
import type { Schedule } from '../types'

const schedule: Schedule = {
  id: 'time-range',
  title: '时间范围测试',
  startAt: new Date(2026, 7, 28, 9, 0).toISOString(),
  endAt: new Date(2026, 7, 28, 10, 30).toISOString(),
  location: '',
  notes: '',
  color: '#3b82f6',
  reminderOffsets: [],
  status: 'pending',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

describe('日视图当前时间线', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('每分钟更新时间并在 21:00 后移除时间线', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 28, 20, 59, 30))
    const { container } = render(
      <DayView
        date={new Date(2026, 7, 28)}
        schedules={[]}
        onOpenSchedule={vi.fn()}
        onCreateAt={vi.fn()}
      />,
    )

    expect(container.querySelector('.current-time')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(60_000))
    expect(container.querySelector('.current-time')).not.toBeInTheDocument()
  })

  it('日视图和周视图都展示开始及结束时间', () => {
    const dayView = render(
      <DayView
        date={new Date(2026, 7, 28)}
        schedules={[schedule]}
        onOpenSchedule={vi.fn()}
        onCreateAt={vi.fn()}
      />,
    )
    expect(dayView.getByText('09:00 - 10:30')).toBeInTheDocument()
    dayView.unmount()

    const weekView = render(
      <WeekView
        date={new Date(2026, 7, 28)}
        schedules={[schedule]}
        onSelectDate={vi.fn()}
        onOpenSchedule={vi.fn()}
      />,
    )
    expect(weekView.getByText('09:00 - 10:30')).toBeInTheDocument()
  })
})
