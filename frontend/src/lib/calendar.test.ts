import { describe, expect, it } from 'vitest'
import type { Schedule } from '../types'
import { DAY_END_HOUR, DAY_START_HOUR, HOUR_HEIGHT, currentTimeTop, daysWithSchedules, monthGrid, positionDaySchedules, roundToNextHalfHour, schedulesForDay, weekGrid } from './calendar'

function schedule(id: string, startAt: string, endAt: string): Schedule {
  return {
    id,
    title: id,
    startAt,
    endAt,
    color: '#3b82f6',
    reminderOffsets: [],
    status: 'pending',
    createdAt: startAt,
    updatedAt: startAt,
  }
}

function localTimestamp(day: number, hour: number, minute = 0): string {
  return new Date(2026, 7, day, hour, minute, 0, 0).toISOString()
}

describe('日历日期计算', () => {
  it('月历始终从周一开始并覆盖完整周', () => {
    const days = monthGrid(new Date(2026, 7, 1))
    expect(days[0].getDay()).toBe(1)
    expect(days[days.length - 1].getDay()).toBe(0)
    expect(days.length % 7).toBe(0)
  })

  it('周视图返回从周一开始的七天', () => {
    const days = weekGrid(new Date(2026, 7, 28))
    expect(days).toHaveLength(7)
    expect(days[0].getDay()).toBe(1)
    expect(days[6].getDay()).toBe(0)
  })

  it('跨午夜日程会出现在两天中', () => {
    const item = schedule('跨天', localTimestamp(28, 23, 30), localTimestamp(29, 0, 30))
    expect(schedulesForDay([item], new Date(2026, 7, 28))).toHaveLength(1)
    expect(schedulesForDay([item], new Date(2026, 7, 29))).toHaveLength(1)
    expect(daysWithSchedules([item]).size).toBe(2)
  })

  it('在午夜结束的日程不会占用下一天', () => {
    const item = schedule('当天', localTimestamp(28, 23), localTimestamp(29, 0))
    expect(daysWithSchedules([item]).size).toBe(1)
  })

  it('重叠日程会分配到独立列', () => {
    const items = [
      schedule('一', localTimestamp(28, 9), localTimestamp(28, 10)),
      schedule('二', localTimestamp(28, 9, 30), localTimestamp(28, 10, 30)),
    ]
    const result = positionDaySchedules(items, new Date(2026, 7, 28))
    expect(result[0].width).toBe(50)
    expect(result[1].left).toBe(50)
  })

  it('日视图覆盖 08:00 到 21:00，并排除结束边界后的日程', () => {
    expect(DAY_START_HOUR).toBe(8)
    expect(DAY_END_HOUR).toBe(21)

    const lateSchedule = schedule('晚间日程', localTimestamp(28, 20, 30), localTimestamp(28, 21))
    const afterRange = schedule('范围外日程', localTimestamp(28, 21), localTimestamp(28, 22))
    const result = positionDaySchedules([lateSchedule, afterRange], new Date(2026, 7, 28))

    expect(result).toHaveLength(1)
    expect(result[0].schedule.id).toBe('晚间日程')
    expect(result[0].top + result[0].height).toBe((DAY_END_HOUR - DAY_START_HOUR) * HOUR_HEIGHT)
    expect(result[0].height).toBe(HOUR_HEIGHT / 2)
  })

  it('普通位置的半小时日程使用真实 30.5px 高度', () => {
    const item = schedule('半小时日程', localTimestamp(28, 11, 30), localTimestamp(28, 12))
    const [result] = positionDaySchedules([item], new Date(2026, 7, 28))

    expect(result.height).toBe(HOUR_HEIGHT / 2)
    expect(result.top + result.height).toBe((12 - DAY_START_HOUR) * HOUR_HEIGHT)
  })

  it('当前时间线只在 08:00 到 21:00 的排他区间内显示', () => {
    const day = new Date(2026, 7, 28)
    expect(currentTimeTop(day, new Date(2026, 7, 28, 8, 0))).toBe(0)
    expect(currentTimeTop(day, new Date(2026, 7, 28, 20, 30))).toBe(12.5 * HOUR_HEIGHT)
    expect(currentTimeTop(day, new Date(2026, 7, 28, 21, 0))).toBeNull()
    expect(currentTimeTop(day, new Date(2026, 7, 28, 21, 30))).toBeNull()
  })

  it('新建时间向上取整到下一个半小时', () => {
    const result = roundToNextHalfHour(new Date(2026, 7, 28, 9, 42, 17))
    expect(result.getHours()).toBe(10)
    expect(result.getMinutes()).toBe(0)
    expect(result.getSeconds()).toBe(0)
  })
})
