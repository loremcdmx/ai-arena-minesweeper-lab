import { expect, test } from '@playwright/test'

test('training cycle exposes live telemetry, keeps the board animating, and stop-run does not stop training', async ({
  page,
}) => {
  const consoleErrors: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })

  await page.goto('/')

  await page.getByTestId('settings-generations').fill('14')
  await page.getByTestId('settings-population').fill('18')
  await page.getByTestId('settings-games-per-genome').fill('4')
  await page.getByTestId('settings-validation').fill('4')

  await expect(page.locator('[data-testid="training-monitor"]')).toBeVisible()
  await expect(page.locator('[data-testid="preview-status"]')).toContainText(/auto watch|live bot run|watch paused/i)
  await expect(page.locator('.training-spinner.running')).toHaveCount(0)

  await page.getByTestId('train-button').click()

  await expect(page.locator('.training-spinner.running')).toBeVisible()
  await expect(page.locator('.terminal-panel .terminal-log')).toContainText(/launch/i)
  await expect(page.locator('.profile-hub > .profile-vitals')).toBeVisible()
  await expect(page.locator('.quality-grid .stat-chip')).toHaveCount(9)

  const board = page.locator('.mine-cell.revealed')
  await page.getByTestId('toggle-preview-run').click()

  await expect(page.locator('[data-testid="preview-status"]')).toContainText(/watch paused/i)
  await expect(page.locator('.training-spinner.running')).toBeVisible()
  const frozenAfterStop = await board.count()
  await page.waitForTimeout(500)
  expect(await board.count()).toBe(frozenAfterStop)

  await page.getByTestId('toggle-preview-run').click()
  await expect
    .poll(
      async () =>
        /watch paused/i.test(await page.locator('[data-testid="preview-status"]').innerText()),
      { timeout: 15_000 },
    )
    .toBe(false)
  await expect.poll(async () => board.count()).toBeGreaterThan(frozenAfterStop)

  await expect.poll(async () => {
    const width = await page
      .locator('[data-testid="training-progress"] .training-meter-fill')
      .evaluate((node) => Number.parseFloat((node as HTMLElement).style.width))
    return width
  }).toBeGreaterThan(0)

  await expect
    .poll(async () => page.locator('[data-testid="metric-pace"] strong').innerText())
    .not.toBe('0.00 / мин')

  await expect
    .poll(async () => page.locator('[data-testid="metric-fitness-gain"] strong').innerText())
    .not.toBe('+0.00')

  await expect
    .poll(async () => page.locator('[data-testid="metric-average-fitness"] strong').innerText())
    .not.toBe('0.00')

  await expect(page.locator('.priority-panel .signal-strip')).toContainText(/G\d{3}/)
  await expect(page.locator('.generation-row').first()).toBeVisible({
    timeout: 20_000,
  })

  await page.getByTestId('stop-training').click()
  await expect(page.locator('.training-spinner.running')).toHaveCount(0)
  await expect(page.locator('.terminal-panel .terminal-log')).toContainText(/gen 00/i)

  expect(consoleErrors).toEqual([])
})
