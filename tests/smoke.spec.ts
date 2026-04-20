import { expect, test } from '@playwright/test'

test('profile workflow trains the active model, locks the board to AI, and keeps history scoped to profiles', async ({
  page,
}) => {
  const consoleErrors: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })

  await page.goto('/')

  await expect(page.getByTestId('train-button')).toBeVisible()
  await expect(page.locator('.profile-hub')).toBeVisible()
  await expect(page.locator('.mine-grid')).toBeVisible()
  await expect(page.locator('.mine-cell').first()).toBeDisabled()
  await expect(page.locator('.mine-cell.revealed')).toHaveCount(0)

  await page.getByTestId('settings-generations').fill('1')
  await page.getByTestId('settings-population').fill('8')
  await page.getByTestId('settings-games-per-genome').fill('2')
  await page.getByTestId('settings-validation').fill('2')

  const firstProfileId = await page.locator('.profile-picker select').inputValue()

  await page.getByTestId('train-button').click()

  await expect(page.locator('.terminal-panel .terminal-log')).toContainText(/launch/i)
  await expect(page.locator('.generation-row').first()).toBeVisible({
    timeout: 20_000,
  })
  await expect.poll(async () => page.locator('.mine-cell.revealed').count()).toBeGreaterThan(0)
  await expect(page.locator('.training-spinner.running')).toBeVisible()

  await page.getByTestId('stop-training').click()
  await expect(page.locator('.training-spinner.running')).toHaveCount(0)
  await expect
    .poll(async () => page.locator('[data-testid="minesweeper-viewer-select"] option').count())
    .toBeGreaterThan(1)

  await page.getByTestId('new-profile-button').click()

  const secondProfileId = await page.locator('.profile-picker select').inputValue()
  expect(secondProfileId).not.toBe(firstProfileId)

  await expect(page.locator('.ledger-panel .empty-state')).toBeVisible()
  await expect(page.locator('.mine-cell').first()).toBeDisabled()

  await page.locator('.profile-picker select').selectOption(firstProfileId)

  await expect(page.locator('.generation-row').first()).toBeVisible()
  await expect.poll(async () => page.locator('.mine-cell.revealed').count()).toBeGreaterThan(0)

  expect(consoleErrors).toEqual([])
})
