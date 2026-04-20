import { expect, test } from '@playwright/test'

function numericValue(text: string) {
  return Number.parseFloat(text.replace(/[^\d.-]/g, ''))
}

test('chess grows past the previous 2200 ceiling', async ({ page }) => {
  const consoleErrors: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })

  await page.goto('/')
  await page.getByTestId('game-switch-chess').click()

  await expect(page.locator('.strategy-board-chess')).toBeVisible()

  await page.getByLabel(/Self-play matches/i).fill('48')
  await page.getByLabel(/Sparring matches/i).fill('40')
  await page.getByLabel(/Learning rate/i).fill('0.35')
  await page.getByLabel(/Exploration noise/i).fill('0.05')

  await page.getByRole('button', { name: /^Train$/i }).click()
  await expect(page.getByTestId('strategy-training-status')).toContainText(/Training/i)

  await expect
    .poll(
      async () => numericValue(await page.getByTestId('strategy-current-rating').innerText()),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(2200)

  await expect
    .poll(
      async () => numericValue(await page.getByTestId('strategy-current-elo').innerText()),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(2200)

  await page.getByTestId('strategy-stop-training').click()
  await expect(page.getByTestId('strategy-training-status')).toContainText(
    /Waiting to start/i,
  )

  expect(consoleErrors).toEqual([])
})
