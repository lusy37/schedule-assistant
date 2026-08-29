import { useState } from 'react'
import { Check, MapPin, Trash2, X } from 'lucide-react'
import { isSameDay } from 'date-fns'
import type { Schedule, ScheduleInput } from '../types'
import { ScheduleDateTimeFields } from './ScheduleDateTimeFields'
import { ReminderPicker } from './ReminderPicker'

interface ScheduleDialogProps {
  schedule: Schedule | null
  initialStart: Date
  onClose: () => void
  onSave: (input: ScheduleInput) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onToggleComplete: (schedule: Schedule) => Promise<void>
  dateEditable?: boolean
}

const COLOURS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#64748b']

function createForm(schedule: Schedule | null, initialStart: Date): ScheduleInput {
  const end = new Date(initialStart.getTime() + 60 * 60_000)
  return schedule
    ? {
        id: schedule.id,
        title: schedule.title,
        startAt: schedule.startAt,
        endAt: schedule.endAt,
        location: schedule.location,
        notes: schedule.notes,
        color: schedule.color,
        reminderOffsets: schedule.reminderOffsets,
        status: schedule.status,
      }
    : {
        title: '',
        startAt: initialStart.toISOString(),
        endAt: end.toISOString(),
        location: '',
        notes: '',
        color: COLOURS[0],
        reminderOffsets: [15],
      }
}

export function ScheduleDialog({ schedule, initialStart, onClose, onSave, onDelete, onToggleComplete, dateEditable = true }: ScheduleDialogProps) {
  const [form, setForm] = useState(() => createForm(schedule, initialStart))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.title.trim()) return setError('请输入日程标题')
    if (new Date(form.endAt) <= new Date(form.startAt)) return setError('结束时间必须晚于开始时间')
    if (!isSameDay(new Date(form.startAt), new Date(form.endAt))) return setError('日程不能跨天')
    setSaving(true)
    setError('')
    try {
      await onSave(form)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存日程失败')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!schedule) return
    if (!confirmDelete) return setConfirmDelete(true)
    setSaving(true)
    try {
      await onDelete(schedule.id)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '删除日程失败')
      setSaving(false)
    }
  }

  const toggleCompletion = async () => {
    if (!schedule) return
    setSaving(true)
    setError('')
    try {
      await onToggleComplete(schedule)
      setForm((current) => ({
        ...current,
        status: schedule.status === 'completed' ? 'pending' : 'completed',
      }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '更新完成状态失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="schedule-dialog" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="schedule-dialog-title">
        <header className="dialog-header">
          <div><span>{schedule ? '编辑日程' : '新建日程'}</span><h2 id="schedule-dialog-title">{schedule ? schedule.title : '安排新的日程'}</h2></div>
          <button type="button" className="icon-button" onClick={onClose} title="关闭"><X size={19} /></button>
        </header>

        <div className="dialog-body">
          <div className="form-field form-field--title">
            <label htmlFor="schedule-title">日程标题</label>
            <input id="schedule-title" autoFocus maxLength={120} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="准备做什么？" />
          </div>

          <ScheduleDateTimeFields
            startValue={form.startAt}
            endValue={form.endAt}
            dateEditable={dateEditable}
            onChange={(startAt, endAt) => setForm((current) => ({ ...current, startAt, endAt }))}
          />

          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="schedule-location">地点</label>
              <div className="input-with-icon"><MapPin size={16} /><input id="schedule-location" maxLength={200} value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} placeholder="添加地点" /></div>
            </div>
            <ReminderPicker value={form.reminderOffsets} onChange={(reminderOffsets) => setForm((current) => ({ ...current, reminderOffsets }))} />
          </div>

          <div className="form-field">
            <label htmlFor="schedule-notes">备注</label>
            <textarea id="schedule-notes" maxLength={4000} rows={3} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="补充日程信息" />
          </div>

          <fieldset className="colour-field">
            <legend>颜色</legend>
            <div>{COLOURS.map((colour) => <button type="button" key={colour} className={form.color === colour ? 'is-selected' : ''} style={{ background: colour }} onClick={() => setForm((current) => ({ ...current, color: colour }))} aria-label={`选择颜色 ${colour}`}>{form.color === colour && <Check size={13} />}</button>)}</div>
          </fieldset>

          {error && <p className="form-error" role="alert">{error}</p>}
        </div>

        <footer className="dialog-footer">
          <div className="dialog-footer__secondary">
            {schedule && <button type="button" className={`button ${confirmDelete ? 'button--danger' : 'button--ghost-danger'}`} onClick={remove} disabled={saving}><Trash2 size={15} />{confirmDelete ? '再次点击确认' : '删除'}</button>}
            {schedule && <button type="button" className="button button--ghost" onClick={toggleCompletion} disabled={saving}><Check size={15} />{schedule.status === 'completed' ? '恢复未完成' : '标记完成'}</button>}
          </div>
          <div className="dialog-footer__primary">
            <button type="button" className="button button--ghost" onClick={onClose}>取消</button>
            <button type="submit" className="button button--primary" disabled={saving}>{saving ? '保存中…' : '保存日程'}</button>
          </div>
        </footer>
      </form>
    </div>
  )
}
