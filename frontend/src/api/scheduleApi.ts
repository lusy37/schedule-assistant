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

function readLocalSchedules(): Schedule[] {
  const value = localStorage.getItem(STORAGE_KEY)
  if (value) {
    try {
      return JSON.parse(value) as Schedule[]
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    }
  }
  return []
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
    if (isDesktopRuntime()) {
      await ScheduleService.SendTestNotification()
      return
    }
    if (!('Notification' in window)) throw new Error('当前浏览器不支持系统通知')

    const permission = Notification.permission === 'default'
      ? await Notification.requestPermission()
      : Notification.permission
    if (permission !== 'granted') throw new Error('通知权限未授权，请在系统或浏览器设置中开启')

    new Notification('日程助手通知测试', { body: '系统通知工作正常。' })
  },

  minimise: () => isDesktopRuntime() && ScheduleService.MinimiseWindow(),
  maximise: () => isDesktopRuntime() && ScheduleService.ToggleMaximiseWindow(),
  close: () => isDesktopRuntime() && ScheduleService.HideWindow(),
}
