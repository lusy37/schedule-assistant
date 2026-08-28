import { describe, expect, it } from 'vitest'
import type { Schedule } from '../types'
import { daysWithSchedules, monthGrid, positionDaySchedules, roundToNextHalfHour, schedulesForDay, weekGrid } from './calendar'

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
    const item = schedule('跨天', '2026-08-28T23:30:00+08:00', '2026-08-29T00:30:00+08:00')
    expect(schedulesForDay([item], new Date(2026, 7, 28))).toHaveLength(1)
    expect(schedulesForDay([item], new Date(2026, 7, 29))).toHaveLength(1)
    expect(daysWithSchedules([item]).size).toBe(2)
  })

  it('在午夜结束的日程不会占用下一天', () => {
    const item = schedule('当天', '2026-08-28T23:00:00+08:00', '2026-08-29T00:00:00+08:00')
    expect(daysWithSchedules([item]).size).toBe(1)
  })

  it('重叠日程会分配到独立列', () => {
    const items = [
      schedule('一', '2026-08-28T09:00:00+08:00', '2026-08-28T10:00:00+08:00'),
      schedule('二', '2026-08-28T09:30:00+08:00', '2026-08-28T10:30:00+08:00'),
    ]
    const result = positionDaySchedules(items, new Date(2026, 7, 28))
    expect(result[0].width).toBe(50)
    expect(result[1].left).toBe(50)
  })

  it('新建时间向上取整到下一个半小时', () => {
    const result = roundToNextHalfHour(new Date(2026, 7, 28, 9, 42, 17))
    expect(result.getHours()).toBe(10)
    expect(result.getMinutes()).toBe(0)
    expect(result.getSeconds()).toBe(0)
  })
})
