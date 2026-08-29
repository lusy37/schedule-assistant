import { expect, test } from '@playwright/test'

test('日程完整业务流程与选择器失焦提交', async ({ context, page }) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => browserErrors.push(`page: ${error.message}`))
  page.on('response', (response) => {
    if (response.status() >= 400) browserErrors.push(`http ${response.status()}: ${response.url()}`)
  })

  await context.grantPermissions(['notifications'], { origin: 'http://127.0.0.1:9245' })
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.removeItem('schedule-assistant:schedules')
    localStorage.removeItem('schedule-assistant:autostart')
  })
  await page.reload()

  const title = `UAT回归日程-${Date.now()}`
  const editedTitle = `${title}-已编辑`
  const visibleRangePopup = () => page.locator('.schedule-time-picker-popup.ant-picker-dropdown:not(.ant-slide-up-leave):visible')
  const selectTime = async (dialog: ReturnType<typeof page.getByRole>, field: '开始时间' | '结束时间', hour: number, minute: number) => {
    await dialog.getByLabel(field).click()
    const kind = field === '开始时间' ? 'start' : 'end'
    const popup = page.locator(`.schedule-${kind}-time-popup.ant-picker-dropdown:not(.ant-slide-up-leave):visible`)
    await expect(popup).toBeVisible()
    const columns = popup.locator('.ant-picker-time-panel-column')
    if (kind === 'start') {
      await expect(columns.nth(0).locator('[data-value="7"]')).toHaveCount(0)
      await expect(columns.nth(0).locator('[data-value="8"]')).toHaveCount(1)
      await expect(columns.nth(0).locator('[data-value="20"]')).toHaveCount(1)
      await expect(columns.nth(0).locator('[data-value="21"]')).toHaveCount(0)
    } else {
      await expect(columns.nth(0).locator('[data-value="21"]')).toHaveCount(1)
      await expect(columns.nth(0).locator('[data-value="22"]')).toHaveCount(0)
    }
    await columns.nth(0).locator(`[data-value="${hour}"]`).click()
    await columns.nth(1).locator(`[data-value="${minute}"]`).click()
    const expected = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    await expect(dialog.getByLabel(field)).toHaveValue(expected)
    await page.waitForTimeout(250)
    await expect(dialog.getByLabel(field)).toHaveValue(expected)
  }

  await test.step('日视图时间轴覆盖 08:00 到 21:00', async () => {
    const timeline = page.locator('.timeline-hours')
    await expect(timeline.getByText('08:00', { exact: true })).toBeVisible()
    await expect(timeline.getByText('21:00', { exact: true })).toBeVisible()
    await expect(timeline.getByText('22:00', { exact: true })).toHaveCount(0)
  })

  await test.step('月历导航可往返', async () => {
    const monthHeading = page.locator('.mini-calendar__header strong')
    const initialMonth = await monthHeading.textContent()
    await page.getByRole('button', { name: '下个月' }).click()
    await expect(monthHeading).not.toHaveText(initialMonth ?? '')
    await page.getByRole('button', { name: '上个月' }).click()
    await expect(monthHeading).toHaveText(initialMonth ?? '')
  })

  await test.step('从日视图时间轴创建时日期固定且无需再次选择', async () => {
    const timeline = page.locator('.timeline-grid')
    await timeline.dblclick({ position: { x: 180, y: 153 } })
    const dialog = page.getByRole('dialog', { name: '安排新的日程' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('textbox', { name: '日期' })).toHaveCount(0)
    await expect(dialog.getByLabel(/^日期：/)).toBeVisible()
    await expect(dialog.getByLabel('开始时间')).toHaveValue('10:30')
    await dialog.getByRole('button', { name: '取消' }).click()
    await expect(dialog).toHaveCount(0)
  })

  await test.step('连体时间范围与提醒选择器通过外部点击保存最新值', async () => {
    await page.getByRole('button', { name: '新建日程' }).click()
    const dialog = page.getByRole('dialog', { name: '安排新的日程' })
    await dialog.getByLabel('日程标题').fill(title)

    await expect(dialog.getByLabel('日期')).toBeVisible()
    const rangePicker = dialog.locator('.schedule-time-range-control')
    await expect(rangePicker.locator('input')).toHaveCount(2)
    await selectTime(dialog, '开始时间', 10, 0)
    await selectTime(dialog, '结束时间', 11, 0)
    await expect(visibleRangePopup().locator('.ant-picker-time-panel-column')).toHaveCount(2)
    await expect(visibleRangePopup().locator('.ant-picker-ok')).toBeHidden()
    await dialog.getByLabel('日程标题').click()
    await expect(visibleRangePopup()).toHaveCount(0)
    await expect(dialog.getByLabel('开始时间')).toHaveValue(/10:00$/)
    await expect(dialog.getByLabel('结束时间')).toHaveValue(/11:00$/)

    await dialog.getByRole('button', { name: /已设置 1 个提醒/ }).click()
    await page.getByRole('button', { name: '提前 30 分钟' }).click()
    await expect(dialog.locator('.reminder-field__selection').getByText('提前 30 分钟')).toBeVisible()
    await expect(dialog.getByRole('button', { name: /已设置 2 个提醒/ })).toBeVisible()
    await dialog.getByLabel('日程标题').click()
    await expect(page.getByRole('dialog', { name: '提醒选择器' })).toBeHidden()
    await expect(dialog.getByText('提前 30 分钟')).toBeVisible()
    await dialog.getByRole('button', { name: '保存日程' }).click()
    await expect(page.getByText('日程已创建')).toBeVisible()
    await expect(page.locator('.schedule-block').filter({ hasText: title })).toContainText('10:00 - 11:00')
  })

  await test.step('刷新后数据仍存在并可进入编辑', async () => {
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible()
    await expect.poll(() => page.evaluate((expectedTitle) => {
      const stored = localStorage.getItem('schedule-assistant:schedules')
      return stored ? JSON.parse(stored).some((item: { title: string }) => item.title === expectedTitle) : false
    }, title)).toBe(true)
    await page.reload()
    await expect.poll(() => page.evaluate((expectedTitle) => {
      const stored = localStorage.getItem('schedule-assistant:schedules')
      return stored ? JSON.parse(stored).some((item: { title: string }) => item.title === expectedTitle) : false
    }, title)).toBe(true)
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible()
    await page.locator('.agenda-item').filter({ hasText: title }).click()
  })

  await test.step('父级重渲染不会清空草稿，Enter 和 Esc 行为正确', async () => {
    const dialog = page.getByRole('dialog', { name: title })
    await dialog.getByLabel('日程标题').fill(editedTitle)
    await page.waitForTimeout(3_000)
    await expect(dialog.getByLabel('日程标题')).toHaveValue(editedTitle)

    await selectTime(dialog, '开始时间', 9, 0)
    await dialog.getByLabel('日程标题').click()
    await expect(visibleRangePopup()).toHaveCount(0)
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('开始时间')).toHaveValue(/09:00$/)

    await dialog.getByRole('button', { name: /已设置 2 个提醒/ }).click()
    await dialog.getByRole('spinbutton', { name: '自定义提醒分钟' }).fill('45')
    await dialog.getByRole('spinbutton', { name: '自定义提醒分钟' }).press('Enter')
    await expect(page.getByRole('dialog', { name: '提醒选择器' })).toBeHidden()
    await expect(dialog.getByText('提前 45 分钟')).toBeVisible()

    await dialog.getByLabel('结束时间').click()
    await page.keyboard.press('Escape')
    await expect(visibleRangePopup()).toHaveCount(0)
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('结束时间')).toBeFocused()
    await dialog.getByRole('button', { name: '保存日程' }).click()
    await expect(page.getByText('日程已更新')).toBeVisible()
  })

  await test.step('周视图和完成状态可正常切换', async () => {
    await page.getByRole('button', { name: '周', exact: true }).click()
    const weekItem = page.locator('.week-item').filter({ hasText: editedTitle })
    await expect(weekItem).toBeVisible()
    await expect(weekItem).toContainText('09:00 - 11:00')
    await page.getByRole('button', { name: '日', exact: true }).click()

    const agendaItem = page.locator('.agenda-item').filter({ hasText: editedTitle })
    await agendaItem.getByRole('button', { name: '标记为已完成' }).click()
    await expect(agendaItem).toHaveClass(/is-completed/)
    await agendaItem.getByRole('button', { name: '标记为未完成' }).click()
    await expect(agendaItem).not.toHaveClass(/is-completed/)
  })

  await test.step('设置项与测试通知返回真实结果', async () => {
    await page.getByRole('button', { name: '打开设置' }).click()
    const settings = page.getByRole('dialog', { name: '设置' })
    const autostart = settings.getByRole('checkbox')
    await settings.locator('.switch').click()
    await expect(autostart).toBeChecked()
    await settings.locator('.switch').click()
    await expect(autostart).not.toBeChecked()
    await settings.getByRole('button', { name: '发送测试' }).click()
    await expect(page.getByText('测试通知已发送')).toBeVisible()
    await settings.getByRole('button', { name: '关闭' }).click()
  })

  await test.step('删除后刷新不会恢复数据', async () => {
    await page.locator('.agenda-item').filter({ hasText: editedTitle }).click()
    const dialog = page.getByRole('dialog', { name: editedTitle })
    await dialog.getByRole('button', { name: '删除', exact: true }).click()
    await dialog.getByRole('button', { name: '再次点击确认' }).click()
    await expect(page.getByText(editedTitle, { exact: true })).toHaveCount(0)
    await page.reload()
    await expect(page.getByText(editedTitle, { exact: true })).toHaveCount(0)
  })

  await test.step('11:30 到 12:00 的半小时日程块不会越过结束刻度', async () => {
    const lateTitle = `半小时边界日程-${Date.now()}`
    await page.getByRole('button', { name: '新建日程' }).click()
    const dialog = page.getByRole('dialog', { name: '安排新的日程' })
    await dialog.getByLabel('日程标题').fill(lateTitle)
    await selectTime(dialog, '开始时间', 11, 30)
    await selectTime(dialog, '结束时间', 12, 0)
    await dialog.getByLabel('日程标题').click()
    await dialog.getByRole('button', { name: '保存日程' }).click()

    const timeline = page.locator('.timeline-grid')
    const lateBlock = timeline.locator('.schedule-block').filter({ hasText: lateTitle })
    const noonLine = timeline.locator('.timeline-line[data-hour="12"]')
    await expect(lateBlock).toBeVisible()
    const [noonLineBox, blockBox] = await Promise.all([noonLine.boundingBox(), lateBlock.boundingBox()])
    expect(noonLineBox).not.toBeNull()
    expect(blockBox).not.toBeNull()
    expect(blockBox!.height).toBeCloseTo(30.5, 0)
    expect(blockBox!.y + blockBox!.height).toBeLessThanOrEqual(noonLineBox!.y + 0.5)

    await lateBlock.click()
    const editDialog = page.getByRole('dialog', { name: lateTitle })
    await editDialog.getByRole('button', { name: '删除', exact: true }).click()
    await editDialog.getByRole('button', { name: '再次点击确认' }).click()
    await expect(page.getByText(lateTitle, { exact: true })).toHaveCount(0)
  })

  expect(browserErrors).toEqual([])
})
