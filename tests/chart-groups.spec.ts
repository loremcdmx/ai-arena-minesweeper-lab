import { expect, test } from '@playwright/test'

test('growth telemetry is split into multiple chart groups', async ({ page }) => {
  const consoleErrors: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })

  await page.goto('/')

  await page
    .locator('.priority-panel .disclosure-header')
    .filter({ hasText: /Growth charts/i })
    .click()
  await expect(page.getByText(/Fitness curve/i)).toBeVisible()
  await expect(page.getByText(/Outcome quality/i)).toBeVisible()
  await expect(page.getByText(/Search pressure/i)).toBeVisible()

  await page.getByTestId('game-switch-chess').click()

  await expect(page.getByText(/Strength curve/i)).toBeVisible()
  await expect(page.getByText(/Quality curve/i)).toBeVisible()
  await expect(page.getByText(/Style balance/i)).toBeVisible()

  expect(consoleErrors).toEqual([])
})
