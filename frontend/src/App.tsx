import { useCallback, useEffect, useMemo, useState } from 'react'
import { Events } from '@wailsio/runtime'
import { CalendarClock, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { addDays, format, isSameDay } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { scheduleApi, isDesktopRuntime } from './api/scheduleApi'
import { AgendaSidebar } from './components/AgendaSidebar'
import { DayView } from './components/DayView'
import { ScheduleDialog } from './components/ScheduleDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { TitleBar } from './components/TitleBar'
import { WeekView } from './components/WeekView'
import { DAY_END_HOUR, DAY_START_HOUR, roundToNextHalfHour } from './lib/calendar'
import type { CalendarView, Schedule, ScheduleInput } from './types'

function initialStartFor(date: Date) {
  if (isSameDay(date, new Date())) {
    const rounded = roundToNextHalfHour(new Date())
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), DAY_START_HOUR)
    const latestStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), DAY_END_HOUR - 1)
    if (rounded < dayStart) return dayStart
    if (rounded > latestStart) return latestStart
    return rounded
  }
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9, 0)
}

function App() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [view, setView] = useState<CalendarView>('day')
  const [dialogSchedule, setDialogSchedule] = useState<Schedule | null>(null)
  const [dialogDateEditable, setDialogDateEditable] = useState(true)
  const [dialogStart, setDialogStart] = useState<Date | null>(() => (
    import.meta.env.DEV && ['new', 'picker', 'reminder'].includes(new URLSearchParams(window.location.search).get('preview') ?? '')
      ? initialStartFor(new Date())
      : null
  ))
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  const loadSchedules = useCallback(async () => {
    try {
      setSchedules(await scheduleApi.list())
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : '读取日程失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadSchedules() }, [loadSchedules])

  useEffect(() => {
    if (!isDesktopRuntime()) return
    const refresh = () => void loadSchedules()
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [loadSchedules])

  useEffect(() => {
    if (!isDesktopRuntime()) return
    const unsubscribeChanged = Events.On('schedule:changed', () => void loadSchedules())
    const unsubscribeCreate = Events.On('schedule:create', () => {
      setDialogDateEditable(true)
      setDialogStart(initialStartFor(selectedDate))
    })
    const unsubscribeOpen = Events.On('schedule:open', (event) => {
      const schedule = schedules.find((item) => item.id === event.data)
      if (schedule) {
        setDialogDateEditable(true)
        setDialogSchedule(schedule)
      }
    })
    return () => { unsubscribeChanged(); unsubscribeCreate(); unsubscribeOpen() }
  }, [loadSchedules, schedules, selectedDate])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 2800)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setDialogStart(null)
      setDialogSchedule(null)
      setSettingsOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const openCreate = (start = initialStartFor(selectedDate), dateEditable = true) => {
    setDialogSchedule(null)
    setDialogDateEditable(dateEditable)
    setDialogStart(start)
  }

  const closeDialog = () => {
    setDialogSchedule(null)
    setDialogStart(null)
  }

  const saveSchedule = async (input: ScheduleInput) => {
    const saved = await scheduleApi.save(input)
    setSchedules((current) => [...current.filter((item) => item.id !== saved.id), saved])
    setSelectedDate(new Date(saved.startAt))
    closeDialog()
    setToast(input.id ? '日程已更新' : '日程已创建')
  }

  const deleteSchedule = async (id: string) => {
    await scheduleApi.remove(id)
    setSchedules((current) => current.filter((item) => item.id !== id))
    closeDialog()
    setToast('日程已删除')
  }

  const toggleComplete = async (schedule: Schedule) => {
    const updated = await scheduleApi.setCompleted(schedule.id, schedule.status !== 'completed')
    setSchedules((current) => current.map((item) => item.id === updated.id ? updated : item))
    if (dialogSchedule?.id === updated.id) setDialogSchedule(updated)
    setToast(updated.status === 'completed' ? '已标记为完成' : '已恢复为未完成')
  }

  const moveDate = (direction: -1 | 1) => {
    setSelectedDate((current) => view === 'day' ? addDays(current, direction) : addDays(current, direction * 7))
  }

  const heading = useMemo(() => {
    if (view === 'week') {
      const weekStart = addDays(selectedDate, -((selectedDate.getDay() + 6) % 7))
      const weekEnd = addDays(weekStart, 6)
      return `${format(weekStart, 'M月d日')} - ${format(weekEnd, 'M月d日')}`
    }
    return format(selectedDate, 'M月d日 EEEE', { locale: zhCN }).replace('星期', '周')
  }, [selectedDate, view])

  return (
    <div className="app-shell">
      <TitleBar onOpenSettings={() => setSettingsOpen(true)} />
      <div className="app-workspace">
        <AgendaSidebar
          schedules={schedules}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          onOpenSchedule={(schedule) => { setDialogStart(null); setDialogDateEditable(true); setDialogSchedule(schedule) }}
          onToggleComplete={(schedule) => void toggleComplete(schedule)}
        />
        <main className="calendar-main">
          <header className="calendar-toolbar">
            <div className="calendar-toolbar__date">
              <button className="icon-button" onClick={() => moveDate(-1)} title={view === 'day' ? '前一天' : '上一周'}><ChevronLeft size={19} /></button>
              <button className="date-heading" onClick={() => setSelectedDate(new Date())} title="回到今天">
                <CalendarClock size={20} /><span>{heading}</span>{isSameDay(selectedDate, new Date()) && <i>今天</i>}
              </button>
              <button className="icon-button" onClick={() => moveDate(1)} title={view === 'day' ? '后一天' : '下一周'}><ChevronRight size={19} /></button>
            </div>
            <div className="view-switch" aria-label="日历视图">
              <button className={view === 'day' ? 'is-active' : ''} onClick={() => setView('day')}>日</button>
              <button className={view === 'week' ? 'is-active' : ''} onClick={() => setView('week')}>周</button>
            </div>
          </header>
          <div className="calendar-content">
            {loading ? (
              <div className="loading-state"><span /><p>正在读取日程</p></div>
            ) : view === 'day' ? (
              <DayView
                date={selectedDate}
                schedules={schedules}
                onOpenSchedule={(schedule) => { setDialogDateEditable(true); setDialogSchedule(schedule) }}
                onCreateAt={(start) => openCreate(start, false)}
              />
            ) : (
              <WeekView
                date={selectedDate}
                schedules={schedules}
                onSelectDate={(date) => { setSelectedDate(date); setView('day') }}
                onOpenSchedule={(schedule) => { setDialogDateEditable(true); setDialogSchedule(schedule) }}
              />
            )}
          </div>
          <button className="create-button" onClick={() => openCreate()} title="新建日程" aria-label="新建日程"><Plus size={24} /></button>
        </main>
      </div>

      {(dialogStart || dialogSchedule) && (
        <ScheduleDialog
          key={dialogSchedule?.id ?? dialogStart?.toISOString()}
          schedule={dialogSchedule}
          initialStart={dialogStart ?? new Date(dialogSchedule!.startAt)}
          onClose={closeDialog}
          onSave={saveSchedule}
          onDelete={deleteSchedule}
          onToggleComplete={toggleComplete}
          dateEditable={dialogSchedule !== null || dialogDateEditable}
        />
      )}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} onNotify={setToast} />}
      {toast && <div className="app-toast" role="status">{toast}</div>}
    </div>
  )
}

export default App
