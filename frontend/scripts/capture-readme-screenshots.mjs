import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from '@playwright/test'

const baseURL = process.env.SCHEDULE_ASSISTANT_PREVIEW_URL ?? 'http://127.0.0.1:9245'
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const outputDirectory = path.resolve(scriptDirectory, '../../docs/screenshots')

await mkdir(outputDirectory, { recursive: true })

const browser = await chromium.launch({ channel: 'msedge' })
const context = await browser.newContext({
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
})
const page = await context.newPage()

try {
  await page.clock.setFixedTime(new Date('2026-08-28T02:00:00.000Z'))
  await page.goto(baseURL, { waitUntil: 'networkidle' })
  await page.evaluate(() => {
    localStorage.removeItem('schedule-assistant:schedules')
    localStorage.removeItem('schedule-assistant:autostart')
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('.loading-state').waitFor({ state: 'detached' })

  await page.screenshot({
    path: path.join(outputDirectory, 'day-view.png'),
    animations: 'disabled',
  })

  await page.getByRole('button', { name: '周', exact: true }).click()
  await page.locator('.week-view').waitFor({ state: 'visible' })
  await page.screenshot({
    path: path.join(outputDirectory, 'week-view.png'),
    animations: 'disabled',
  })

  await page.getByRole('button', { name: '日', exact: true }).click()
  await page.locator('.timeline-grid').waitFor({ state: 'visible' })
  await page.getByRole('button', { name: '新建日程' }).click()
  await page.getByRole('dialog', { name: '安排新的日程' }).waitFor({ state: 'visible' })
  await page.screenshot({
    path: path.join(outputDirectory, 'create-schedule.png'),
    animations: 'disabled',
  })
} finally {
  await browser.close()
}
