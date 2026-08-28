import { CalendarDays, Minus, Settings, Square, X } from 'lucide-react'
import { scheduleApi } from '../api/scheduleApi'

interface TitleBarProps {
  onOpenSettings: () => void
}

export function TitleBar({ onOpenSettings }: TitleBarProps) {
  return (
    <header className="titlebar">
      <div className="titlebar__brand">
        <span className="titlebar__mark"><CalendarDays size={16} strokeWidth={2.4} /></span>
        <span>日程助手</span>
      </div>
      <div className="titlebar__drag" />
      <div className="titlebar__actions">
        <button className="window-button" onClick={onOpenSettings} title="设置" aria-label="打开设置">
          <Settings size={16} />
        </button>
        <button className="window-button" onClick={() => scheduleApi.minimise()} title="最小化" aria-label="最小化窗口">
          <Minus size={17} />
        </button>
        <button className="window-button" onClick={() => scheduleApi.maximise()} title="最大化" aria-label="最大化窗口">
          <Square size={13} />
        </button>
        <button className="window-button window-button--close" onClick={() => scheduleApi.close()} title="关闭到托盘" aria-label="关闭到系统托盘">
          <X size={17} />
        </button>
      </div>
    </header>
  )
}
