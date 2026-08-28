import { ScheduleService } from '../../bindings/schedule-assistant'
import type { RuntimeState, Schedule, ScheduleInput } from '../types'

const STORAGE_KEY = 'schedule-assistant:schedules'
const AUTOSTART_KEY = 'schedule-assistant:autostart'

declare global {
  interface Window {
    _wails?: { environment?: { OS?: string } }
  }
}

export const isDesktopRuntime = () => Boolean(window._wails?.environment?.OS)

function createSeedSchedules(): Schedule[] {
  const day = new Date()
  const now = new Date().toISOString()
  const seeds = [
    ['每周跨部门例会', 9, 0, 10, 0, '会议室 A', '#3b82f6'],
    ['设计稿评审', 11, 30, 12, 0, '在线会议', '#10b981'],
    ['产品路线图规划会议', 14, 0, 15, 30, '会议室 B', '#f59e0b'],
    ['同步下周预算', 16, 30, 17, 0, '办公室', '#8b5cf6'],
  ] as const

  return seeds.map(([title, startHour, startMinute, endHour, endMinute, location, color], index) => ({
    id: `browser-demo-${index + 1}`,
    title,
    startAt: new Date(day.getFullYear(), day.getMonth(), day.getDate(), startHour, startMinute).toISOString(),
    endAt: new Date(day.getFullYear(), day.getMonth(), day.getDate(), endHour, endMinute).toISOString(),
    location,
    notes: '',
    color,
    reminderOffsets: [15],
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  }))
}

function readLocalSchedules(): Schedule[] {
  const value = localStorage.getItem(STORAGE_KEY)
  if (value) {
    try {
      return JSON.parse(value) as Schedule[]
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    }
  }
  const seeds = createSeedSchedules()
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seeds))
  return seeds
}

function writeLocalSchedules(schedules: Schedule[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(schedules))
}

function newLocalID() {
  return globalThis.crypto?.randomUUID?.() ?? `schedule-${Date.now()}`
}

export const scheduleApi = {
  async list(): Promise<Schedule[]> {
    if (isDesktopRuntime()) {
      const result = await ScheduleService.ListSchedules()
      return (result ?? []) as Schedule[]
    }
    return readLocalSchedules()
  },

  async save(input: ScheduleInput): Promise<Schedule> {
    if (isDesktopRuntime()) {
      return (await ScheduleService.SaveSchedule(input)) as Schedule
    }
    const schedules = readLocalSchedules()
    const existing = input.id ? schedules.find((item) => item.id === input.id) : undefined
    const now = new Date().toISOString()
    const saved: Schedule = {
      id: input.id ?? newLocalID(),
      title: input.title.trim(),
      startAt: input.startAt,
      endAt: input.endAt,
      location: input.location?.trim() ?? '',
      notes: input.notes?.trim() ?? '',
      color: input.color,
      reminderOffsets: input.reminderOffsets,
      status: input.status ?? existing?.status ?? 'pending',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    writeLocalSchedules([...schedules.filter((item) => item.id !== saved.id), saved])
    return saved
  },

  async remove(id: string): Promise<void> {
    if (isDesktopRuntime()) {
      await ScheduleService.DeleteSchedule(id)
      return
    }
    writeLocalSchedules(readLocalSchedules().filter((item) => item.id !== id))
  },

  async setCompleted(id: string, completed: boolean): Promise<Schedule> {
    if (isDesktopRuntime()) {
      return (await ScheduleService.SetScheduleCompleted(id, completed)) as Schedule
    }
    const item = readLocalSchedules().find((schedule) => schedule.id === id)
    if (!item) throw new Error('日程不存在')
    return this.save({ ...item, status: completed ? 'completed' : 'pending' })
  },

  async runtimeState(): Promise<RuntimeState> {
    if (isDesktopRuntime()) return (await ScheduleService.RuntimeState()) as RuntimeState
    return {
      autostartEnabled: localStorage.getItem(AUTOSTART_KEY) === 'true',
      databasePath: '浏览器预览使用 localStorage，桌面版使用 SQLite',
    }
  },

  async setAutostart(enabled: boolean): Promise<void> {
    if (isDesktopRuntime()) await ScheduleService.SetAutostart(enabled)
    else localStorage.setItem(AUTOSTART_KEY, String(enabled))
  },

  async testNotification(): Promise<void> {
    if (isDesktopRuntime()) await ScheduleService.SendTestNotification()
    else if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('日程助手通知测试', { body: '系统通知工作正常。' })
    } else if ('Notification' in window) {
      await Notification.requestPermission()
    }
  },

  minimise: () => isDesktopRuntime() && ScheduleService.MinimiseWindow(),
  maximise: () => isDesktopRuntime() && ScheduleService.ToggleMaximiseWindow(),
  close: () => isDesktopRuntime() && ScheduleService.HideWindow(),
}
