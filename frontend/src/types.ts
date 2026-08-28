export type ScheduleStatus = 'pending' | 'completed' | 'cancelled'

export interface Schedule {
  id: string
  title: string
  startAt: string
  endAt: string
  location?: string
  notes?: string
  color: string
  reminderOffsets: number[]
  status: ScheduleStatus
  createdAt: string
  updatedAt: string
}

export interface ScheduleInput {
  id?: string
  title: string
  startAt: string
  endAt: string
  location?: string
  notes?: string
  color: string
  reminderOffsets: number[]
  status?: ScheduleStatus
}

export interface RuntimeState {
  autostartEnabled: boolean
  databasePath: string
}

export type CalendarView = 'day' | 'week'

