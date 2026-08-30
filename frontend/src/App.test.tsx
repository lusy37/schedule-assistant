import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { scheduleApi } from './api/scheduleApi'
import type { Schedule } from './types'

vi.mock('@wailsio/runtime', () => ({
  Events: { On: vi.fn(() => vi.fn()) },
}))

describe('桌面端外部数据刷新', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete window._wails
  })

  it('窗口重新获得焦点后显示 CLI 新增的日程', async () => {
    window._wails = { environment: { OS: 'windows' } }
    const day = new Date()
    const startAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 13, 0)
    const externalSchedule: Schedule = {
      id: 'cli-created-schedule',
      title: 'Codex 创建的日程',
      startAt: startAt.toISOString(),
      endAt: new Date(startAt.getTime() + 60 * 60 * 1000).toISOString(),
      location: '',
      notes: '',
      color: '#3b82f6',
      reminderOffsets: [15],
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const list = vi.spyOn(scheduleApi, 'list')
      .mockResolvedValueOnce([])
      .mockResolvedValue([externalSchedule])

    render(<App />)
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(externalSchedule.title)).not.toBeInTheDocument()

    fireEvent.focus(window)

    expect(await screen.findAllByText(externalSchedule.title)).not.toHaveLength(0)
    expect(list).toHaveBeenCalledTimes(2)
  })
})
