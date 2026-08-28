import { useState } from 'react'
import { Bell, Check, ChevronDown, Plus, X } from 'lucide-react'

interface ReminderPickerProps {
  value: number[]
  onChange: (value: number[]) => void
}

const OPTIONS = [
  { value: 5, label: '提前 5 分钟' },
  { value: 15, label: '提前 15 分钟' },
  { value: 30, label: '提前 30 分钟' },
  { value: 60, label: '提前 1 小时' },
  { value: 120, label: '提前 2 小时' },
  { value: 1440, label: '提前 1 天' },
]

export function reminderLabel(minutes: number) {
  return OPTIONS.find((option) => option.value === minutes)?.label
    ?? (minutes % 1440 === 0 ? `提前 ${minutes / 1440} 天` : `提前 ${minutes} 分钟`)
}

export function ReminderPicker({ value, onChange }: ReminderPickerProps) {
  const [open, setOpen] = useState(() => (
    import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === 'reminder'
  ))
  const [custom, setCustom] = useState('')

  const toggle = (minutes: number) => {
    const next = value.includes(minutes) ? value.filter((item) => item !== minutes) : [...value, minutes]
    onChange(next.sort((left, right) => left - right))
  }

  const addCustom = () => {
    const minutes = Number(custom)
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 43_200) return
    if (!value.includes(minutes)) onChange([...value, minutes].sort((left, right) => left - right))
    setCustom('')
  }

  return (
    <div className="reminder-field">
      <label>提醒</label>
      <button type="button" className="reminder-field__button" onClick={() => setOpen((current) => !current)}>
        <Bell size={17} /><span>{value.length ? `已设置 ${value.length} 个提醒` : '不提醒'}</span><ChevronDown size={16} />
      </button>
      {value.length > 0 && (
        <div className="reminder-tags">
          {value.map((minutes) => (
            <span key={minutes}>{reminderLabel(minutes)}<button type="button" onClick={() => toggle(minutes)} aria-label={`移除${reminderLabel(minutes)}`}><X size={12} /></button></span>
          ))}
        </div>
      )}
      {open && (
        <div className="reminder-menu">
          {OPTIONS.map((option) => (
            <button type="button" key={option.value} onClick={() => toggle(option.value)}>
              <span>{option.label}</span>{value.includes(option.value) && <Check size={15} />}
            </button>
          ))}
          <div className="custom-reminder">
            <input value={custom} onChange={(event) => setCustom(event.target.value)} type="number" min="1" max="43200" placeholder="自定义分钟" />
            <button type="button" onClick={addCustom} title="添加自定义提醒"><Plus size={16} /></button>
          </div>
        </div>
      )}
    </div>
  )
}
