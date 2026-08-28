import { useEffect, useState } from 'react'
import { BellRing, Database, Power, X } from 'lucide-react'
import { scheduleApi } from '../api/scheduleApi'
import type { RuntimeState } from '../types'

interface SettingsDialogProps {
  onClose: () => void
  onNotify: (message: string) => void
}

export function SettingsDialog({ onClose, onNotify }: SettingsDialogProps) {
  const [state, setState] = useState<RuntimeState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { scheduleApi.runtimeState().then(setState).catch(() => undefined) }, [])

  const setAutostart = async (enabled: boolean) => {
    if (!state) return
    setBusy(true)
    try {
      await scheduleApi.setAutostart(enabled)
      setState({ ...state, autostartEnabled: enabled })
      onNotify(enabled ? '已启用开机启动' : '已关闭开机启动')
    } finally {
      setBusy(false)
    }
  }

  const testNotification = async () => {
    setBusy(true)
    try {
      await scheduleApi.testNotification()
      onNotify('测试通知已发送')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="dialog-header">
          <div><span>偏好设置</span><h2 id="settings-title">设置</h2></div>
          <button type="button" className="icon-button" onClick={onClose} title="关闭"><X size={19} /></button>
        </header>
        <div className="settings-list">
          <div className="setting-row">
            <span className="setting-row__icon"><Power size={18} /></span>
            <div><strong>开机启动</strong><span>在后台启动并按时发送提醒</span></div>
            <label className="switch"><input type="checkbox" checked={state?.autostartEnabled ?? false} disabled={!state || busy} onChange={(event) => setAutostart(event.target.checked)} /><span /></label>
          </div>
          <div className="setting-row">
            <span className="setting-row__icon"><BellRing size={18} /></span>
            <div><strong>系统通知</strong><span>检查系统通知权限和显示效果</span></div>
            <button type="button" className="button button--secondary" onClick={testNotification} disabled={busy}>发送测试</button>
          </div>
          <div className="setting-row setting-row--database">
            <span className="setting-row__icon"><Database size={18} /></span>
            <div><strong>本地数据</strong><span className="database-path" title={state?.databasePath}>{state?.databasePath ?? '正在读取…'}</span></div>
          </div>
        </div>
      </section>
    </div>
  )
}
