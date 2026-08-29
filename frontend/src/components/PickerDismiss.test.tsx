import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ScheduleDateTimeFields } from './ScheduleDateTimeFields'
import { MiniCalendar } from './MiniCalendar'
import { ReminderPicker } from './ReminderPicker'
import { ScheduleDialog } from './ScheduleDialog'
import type { Schedule } from '../types'

describe('选择器失焦提交', () => {
  it('迷你月历允许独立切换月份', async () => {
    const user = userEvent.setup()
    render(<MiniCalendar selectedDate={new Date(2026, 7, 28)} markedDays={new Set()} onSelect={vi.fn()} />)

    expect(screen.getByText('2026年8月')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '下个月' }))
    expect(screen.getByText('2026年9月')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '上个月' }))
    expect(screen.getByText('2026年8月')).toBeInTheDocument()
  })

  it('时间范围面板在外部点击时提交草稿并关闭', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const start = new Date(2026, 7, 28, 11, 30)
    const end = new Date(2026, 7, 28, 12, 30)

    render(
      <>
        <ScheduleDateTimeFields startValue={start.toISOString()} endValue={end.toISOString()} dateEditable onChange={onChange} />
        <button type="button">外部区域</button>
      </>,
    )

    await user.click(screen.getByLabelText('开始时间'))
    expect(screen.queryByRole('button', { name: '取消' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确定' })).not.toBeInTheDocument()

    const columns = document.querySelectorAll<HTMLElement>('.ant-picker-time-panel-column')
    expect(columns).toHaveLength(2)
    await user.click(columns[0].querySelector<HTMLElement>('[data-value="10"]')!)
    await user.click(columns[1].querySelector<HTMLElement>('[data-value="0"]')!)
    expect(onChange).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '外部区域' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(new Date(onChange.mock.calls[0][0]).getHours()).toBe(10)
    expect(new Date(onChange.mock.calls[0][1]).getHours()).toBe(12)
    expect(screen.getByLabelText('开始时间').closest('.ant-picker')).not.toHaveClass('ant-picker-open')
  })

  it('提醒面板离开前只更新草稿，外部点击后一次性提交', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <>
        <ReminderPicker value={[15]} onChange={onChange} />
        <button type="button">外部区域</button>
      </>,
    )

    await user.click(screen.getByRole('button', { name: /已设置 1 个提醒/ }))
    await user.click(screen.getByRole('button', { name: '提前 30 分钟' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /已设置 2 个提醒/ })).toBeVisible()

    await user.click(screen.getByRole('button', { name: '外部区域' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith([15, 30])
    expect(screen.queryByRole('button', { name: '提前 30 分钟' })).not.toBeInTheDocument()
  })

  it('有效的自定义提醒在外部点击时一并提交', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <>
        <ReminderPicker value={[]} onChange={onChange} />
        <button type="button">外部区域</button>
      </>,
    )

    await user.click(screen.getByRole('button', { name: /不提醒/ }))
    await user.type(screen.getByPlaceholderText('自定义分钟'), '45')
    await user.click(screen.getByRole('button', { name: '外部区域' }))

    expect(onChange).toHaveBeenCalledWith([45])
  })

  it('选择器打开时点击保存日程不会丢失最后的时间草稿', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)
    const initial = new Date(2026, 7, 28, 11, 30)

    render(
      <ScheduleDialog
        schedule={null}
        initialStart={initial}
        onClose={vi.fn()}
        onSave={onSave}
        onDelete={vi.fn().mockResolvedValue(undefined)}
        onToggleComplete={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    await user.type(screen.getByLabelText('日程标题'), '需求评审')
    await user.click(screen.getByLabelText('开始时间'))
    const columns = document.querySelectorAll<HTMLElement>('.ant-picker-time-panel-column')
    await user.click(columns[0].querySelector<HTMLElement>('[data-value="10"]')!)
    await user.click(screen.getByRole('button', { name: '保存日程' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const savedInput = onSave.mock.calls[0][0]
    expect(new Date(savedInput.startAt).getHours()).toBe(10)
  })

  it('时间范围提供可滚动的小时与分钟快捷选项且不显示确认按钮', async () => {
    const user = userEvent.setup()
    const initial = new Date(2026, 7, 28, 11, 30)

    render(
      <ScheduleDialog
        schedule={null}
        initialStart={initial}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onDelete={vi.fn().mockResolvedValue(undefined)}
        onToggleComplete={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    await user.click(screen.getByLabelText('开始时间'))
    const columns = document.querySelectorAll<HTMLElement>('.ant-picker-time-panel-column')
    expect(columns).toHaveLength(2)
    expect(columns[0].querySelectorAll('[data-value]')).toHaveLength(13)
    expect(columns[1].querySelectorAll('[data-value]')).toHaveLength(12)
    const popup = document.querySelector<HTMLElement>('.ant-picker-dropdown')!
    expect(popup).toHaveClass('schedule-time-picker-popup')
    expect(columns[0].querySelector('[data-value="7"]')).not.toBeInTheDocument()
    expect(columns[0].querySelector('[data-value="8"]')).toBeInTheDocument()
    expect(columns[0].querySelector('[data-value="20"]')).toBeInTheDocument()
    expect(columns[0].querySelector('[data-value="21"]')).not.toBeInTheDocument()
  })

  it('自定义提醒按 Enter 提交当前值但不提交整个表单', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)

    render(
      <ScheduleDialog
        schedule={null}
        initialStart={new Date(2026, 7, 28, 11, 30)}
        onClose={vi.fn()}
        onSave={onSave}
        onDelete={vi.fn().mockResolvedValue(undefined)}
        onToggleComplete={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    await user.type(screen.getByLabelText('日程标题'), '需求评审')
    await user.click(screen.getByRole('button', { name: /已设置 1 个提醒/ }))
    await user.type(screen.getByRole('spinbutton', { name: '自定义提醒分钟' }), '45{Enter}')

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: '提醒选择器' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '保存日程' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0][0].reminderOffsets).toEqual([15, 45])
  })

  it('Esc 只提交并关闭当前选择器，不继续冒泡关闭日程对话框', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const escapedToWindow = vi.fn()
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') escapedToWindow()
    }
    window.addEventListener('keydown', handleWindowKeyDown)

    try {
      render(
        <ScheduleDateTimeFields
          startValue={new Date(2026, 7, 28, 11, 30).toISOString()}
          endValue={new Date(2026, 7, 28, 12, 30).toISOString()}
          dateEditable
          onChange={onChange}
        />,
      )
      const startInput = screen.getByLabelText('开始时间')
      await user.click(startInput)
      await user.keyboard('{Escape}')

      expect(onChange).toHaveBeenCalledTimes(1)
      expect(startInput.closest('.ant-picker')).not.toHaveClass('ant-picker-open')
      expect(escapedToWindow).not.toHaveBeenCalled()
      await waitFor(() => expect(startInput).toHaveFocus())
    } finally {
      window.removeEventListener('keydown', handleWindowKeyDown)
    }
  })

  it('Esc 关闭提醒选择器后焦点回到提醒触发按钮', async () => {
    const user = userEvent.setup()
    render(<ReminderPicker value={[15]} onChange={vi.fn()} />)

    const trigger = screen.getByRole('button', { name: /已设置 1 个提醒/ })
    await user.click(trigger)
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog', { name: '提醒选择器' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('窗口失焦时提交选择器草稿', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ReminderPicker value={[15]} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: /已设置 1 个提醒/ }))
    await user.click(screen.getByRole('button', { name: '提前 30 分钟' }))
    fireEvent(window, new Event('blur'))

    expect(onChange).toHaveBeenCalledWith([15, 30])
    expect(screen.queryByRole('dialog', { name: '提醒选择器' })).not.toBeInTheDocument()
  })

  it('开始与结束时间在同一个范围选择器中切换并一起提交', async () => {
    const user = userEvent.setup()
    render(
      <ScheduleDialog
        schedule={null}
        initialStart={new Date(2026, 7, 28, 11, 30)}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onDelete={vi.fn().mockResolvedValue(undefined)}
        onToggleComplete={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    const startInput = screen.getByLabelText('开始时间')
    const endInput = screen.getByLabelText('结束时间')
    expect(startInput.closest('.schedule-time-range-control')).toBe(endInput.closest('.schedule-time-range-control'))

    await user.click(startInput)
    let columns = document.querySelectorAll<HTMLElement>('.ant-picker-time-panel-column')
    await user.click(columns[0].querySelector<HTMLElement>('[data-value="10"]')!)
    await user.click(endInput)
    columns = document.querySelectorAll<HTMLElement>('.schedule-end-time-popup .ant-picker-time-panel-column')
    await user.click(columns[0].querySelector<HTMLElement>('[data-value="13"]')!)
    await user.click(screen.getByLabelText('备注'))

    expect(startInput).toHaveValue('10:30')
    expect(endInput).toHaveValue('13:30')
  })

  it('父组件重渲染不会覆盖尚未保存的编辑内容', async () => {
    const user = userEvent.setup()
    const schedule: Schedule = {
      id: 'schedule-1',
      title: '原始标题',
      startAt: new Date(2026, 7, 28, 11, 30).toISOString(),
      endAt: new Date(2026, 7, 28, 12, 30).toISOString(),
      location: '',
      notes: '',
      color: '#3b82f6',
      reminderOffsets: [15],
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const props = {
      onClose: vi.fn(),
      onSave: vi.fn().mockResolvedValue(undefined),
      onDelete: vi.fn().mockResolvedValue(undefined),
      onToggleComplete: vi.fn().mockResolvedValue(undefined),
    }
    const { rerender } = render(<ScheduleDialog schedule={schedule} initialStart={new Date(schedule.startAt)} {...props} />)

    const title = screen.getByLabelText('日程标题')
    await user.clear(title)
    await user.type(title, '尚未保存的新标题')
    rerender(<ScheduleDialog schedule={{ ...schedule }} initialStart={new Date(schedule.startAt)} {...props} />)

    expect(screen.getByLabelText('日程标题')).toHaveValue('尚未保存的新标题')
  })

  it('编辑弹窗切换完成状态后保存不会被旧表单状态覆盖', async () => {
    const user = userEvent.setup()
    const schedule: Schedule = {
      id: 'schedule-status',
      title: '状态测试',
      startAt: new Date(2026, 7, 28, 11, 30).toISOString(),
      endAt: new Date(2026, 7, 28, 12, 30).toISOString(),
      location: '',
      notes: '',
      color: '#3b82f6',
      reminderOffsets: [15],
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const onSave = vi.fn().mockResolvedValue(undefined)
    const onToggleComplete = vi.fn().mockResolvedValue(undefined)
    render(
      <ScheduleDialog
        schedule={schedule}
        initialStart={new Date(schedule.startAt)}
        onClose={vi.fn()}
        onSave={onSave}
        onDelete={vi.fn().mockResolvedValue(undefined)}
        onToggleComplete={onToggleComplete}
      />,
    )

    await user.click(screen.getByRole('button', { name: '标记完成' }))
    await waitFor(() => expect(onToggleComplete).toHaveBeenCalledWith(schedule))
    await user.click(screen.getByRole('button', { name: '保存日程' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0][0].status).toBe('completed')
  })

  it('范围输入提供独立的开始与结束时间语义', () => {
    render(
      <ScheduleDateTimeFields
        startValue={new Date(2026, 7, 28, 11, 30).toISOString()}
        endValue={new Date(2026, 7, 28, 12, 30).toISOString()}
        dateEditable
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('开始时间')).toHaveValue('11:30')
    expect(screen.getByLabelText('结束时间')).toHaveValue('12:30')
    expect(screen.getByLabelText('开始时间')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('结束时间')).toHaveAttribute('readonly')
  })

  it('日视图创建模式固定日期且不显示日期输入框', () => {
    render(
      <ScheduleDateTimeFields
        startValue={new Date(2026, 7, 28, 11, 30).toISOString()}
        endValue={new Date(2026, 7, 28, 12, 30).toISOString()}
        dateEditable={false}
        onChange={vi.fn()}
      />,
    )

    expect(screen.queryByRole('textbox', { name: '日期' })).not.toBeInTheDocument()
    expect(screen.getByLabelText(/日期：2026年8月28日/)).toBeVisible()
    expect(screen.getByLabelText('开始时间')).toHaveValue('11:30')
    expect(screen.getByLabelText('结束时间')).toHaveValue('12:30')
  })
})
