import { expect, test } from '@playwright/test'

test('profile auto-escalates arena difficulty as generations grow', async ({
  page,
}) => {
  const consoleErrors: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })

  await page.goto('/')

  await expect(page.locator('.profile-hub > .profile-vitals')).toContainText(/9x9/i)
  await expect(page.locator('.profile-hub > .profile-vitals')).toContainText(/16x16/i)

  await page.getByTestId('settings-generations').fill('6')
  await page.getByTestId('settings-population').fill('8')
  await page.getByTestId('settings-games-per-genome').fill('2')
  await page.getByTestId('settings-validation').fill('2')

  await page.getByTestId('train-button').click()

  await expect
    .poll(async () => page.locator('.profile-hub > .profile-vitals').innerText())
    .toMatch(/16x16[\s\S]*40/)

  await expect(page.locator('.window-titlebar')).toContainText(/16x16/i)
  await expect(page.locator('.profile-hub > .profile-vitals')).toContainText(/16x30/i)

  await page.getByTestId('stop-training').click()
  await expect(page.locator('.training-spinner.running')).toHaveCount(0)

  expect(consoleErrors).toEqual([])
})
