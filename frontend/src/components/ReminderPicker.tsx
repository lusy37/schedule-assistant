import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Bell, Check, ChevronDown, Plus } from 'lucide-react'

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
  const previewOpen = (
    import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === 'reminder'
  )
  const [open, setOpen] = useState(previewOpen)
  const [draft, setDraft] = useState([...value])
  const [custom, setCustom] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const firstOptionRef = useRef<HTMLButtonElement>(null)
  const openRef = useRef(previewOpen)
  const draftRef = useRef([...value])
  const valueRef = useRef(value)
  const customRef = useRef('')
  const menuId = useId()
  valueRef.current = value
  const displayedValue = open ? draft : value

  const updateDraft = (next: number[]) => {
    const sorted = [...next].sort((left, right) => left - right)
    draftRef.current = sorted
    setDraft(sorted)
  }

  const includeCustomValue = () => {
    const minutes = Number(customRef.current)
    if (Number.isInteger(minutes) && minutes >= 1 && minutes <= 43_200 && !draftRef.current.includes(minutes)) {
      updateDraft([...draftRef.current, minutes])
    }
    customRef.current = ''
    setCustom('')
  }

  const commitAndClose = useCallback((restoreFocus = false) => {
    if (!openRef.current) return
    const minutes = Number(customRef.current)
    let next = [...draftRef.current]
    if (Number.isInteger(minutes) && minutes >= 1 && minutes <= 43_200 && !next.includes(minutes)) {
      next = [...next, minutes].sort((left, right) => left - right)
    }
    if (next.length !== valueRef.current.length || next.some((item, index) => item !== valueRef.current[index])) {
      onChange(next)
    }
    customRef.current = ''
    openRef.current = false
    setCustom('')
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }, [onChange])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) commitAndClose()
    }
    const handleFocusIn = (event: FocusEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) commitAndClose()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      commitAndClose(true)
    }
    const handleWindowBlur = () => commitAndClose()

    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('focusin', handleFocusIn, true)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('blur', handleWindowBlur)
    firstOptionRef.current?.focus()
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('focusin', handleFocusIn, true)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [commitAndClose, open])

  const toggleMenu = () => {
    if (openRef.current) {
      commitAndClose()
      return
    }
    updateDraft(value)
    customRef.current = ''
    setCustom('')
    openRef.current = true
    setOpen(true)
  }

  const toggle = (minutes: number) => {
    const next = draftRef.current.includes(minutes)
      ? draftRef.current.filter((item) => item !== minutes)
      : [...draftRef.current, minutes]
    updateDraft(next)
  }

  const addCustom = () => {
    includeCustomValue()
  }

  const handleCustomKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    event.stopPropagation()
    commitAndClose(true)
  }

  return (
    <div className="reminder-field" ref={rootRef}>
      <label>提醒</label>
      <button
        ref={triggerRef}
        type="button"
        className="reminder-field__button"
        onClick={toggleMenu}
        aria-label={displayedValue.length ? `已设置 ${displayedValue.length} 个提醒` : '不提醒'}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={menuId}
      >
        <Bell size={17} />
        <span className="reminder-field__selection">
          {displayedValue.length > 0
            ? displayedValue.map((minutes) => <span className="reminder-field__tag" key={minutes}>{reminderLabel(minutes)}</span>)
            : <span className="reminder-field__placeholder">不提醒</span>}
        </span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="reminder-menu" id={menuId} role="dialog" aria-label="提醒选择器">
          {OPTIONS.map((option, index) => (
            <button type="button" key={option.value} ref={index === 0 ? firstOptionRef : undefined} onClick={() => toggle(option.value)} aria-pressed={draft.includes(option.value)}>
              <span>{option.label}</span>{draft.includes(option.value) && <Check size={15} />}
            </button>
          ))}
          <div className="custom-reminder">
            <input value={custom} onChange={(event) => { customRef.current = event.target.value; setCustom(event.target.value) }} onKeyDown={handleCustomKeyDown} aria-label="自定义提醒分钟" type="number" min="1" max="43200" placeholder="自定义分钟" />
            <button type="button" onClick={addCustom} title="添加自定义提醒" aria-label="添加自定义提醒"><Plus size={16} /></button>
          </div>
        </div>
      )}
    </div>
  )
}
