import { afterEach, describe, expect, it, vi } from 'vitest'
import { scheduleApi } from './scheduleApi'

describe('浏览器测试通知', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('获得授权后真正创建通知', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted')
    const notification = vi.fn()
    Object.assign(notification, {
      permission: 'default',
      requestPermission,
    })
    vi.stubGlobal('Notification', notification)

    await scheduleApi.testNotification()

    expect(requestPermission).toHaveBeenCalledTimes(1)
    expect(notification).toHaveBeenCalledWith('日程助手通知测试', { body: '系统通知工作正常。' })
  })

  it('权限被拒绝时返回明确错误', async () => {
    const notification = vi.fn()
    Object.assign(notification, {
      permission: 'denied',
      requestPermission: vi.fn(),
    })
    vi.stubGlobal('Notification', notification)

    await expect(scheduleApi.testNotification()).rejects.toThrow('通知权限未授权')
    expect(notification).not.toHaveBeenCalled()
  })
})
