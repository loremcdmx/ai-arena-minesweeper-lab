import { expect, test } from '@playwright/test'

test('game switcher opens strategy labs and keeps the training workflow live', async ({
  page,
}) => {
  const consoleErrors: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })

  await page.goto('/')

  await expect(page.getByTestId('game-switch-minesweeper')).toBeVisible()
  await expect(page.getByTestId('game-switch-chess')).toBeVisible()
  await expect(page.locator('.mine-grid')).toBeVisible()

  await page.getByTestId('game-switch-chess').click()

  await expect(page.locator('.strategy-board-chess')).toBeVisible()
  await expect(page.getByTestId('strategy-chess-match-budget')).toBeVisible()
  await page
    .locator('.assistant-panel.elo-panel .disclosure-header')
    .filter({ hasText: /Reference anchors/i })
    .click()
  await expect(page.locator('.elo-reference-list').getByText(/Stockfish Reference Ladder/i).first()).toBeVisible()
  await expect(page.getByTestId('strategy-training-status')).toContainText(
    /Waiting to start/i,
  )
  await expect(page.getByTestId('strategy-run-controls')).toBeVisible()

  await page.getByTestId('strategy-toggle-run').click()
  await expect(page.getByTestId('strategy-view-mode')).toContainText(/paused/i)
  await page.getByTestId('strategy-step-run').click()
  await expect(page.getByTestId('strategy-move-count')).toHaveText(/\d+/)
  await expect(page.locator('.strategy-board-chess')).toBeVisible()
  await page.getByTestId('strategy-toggle-run').click()

  await page.getByTestId('chess-layout-broadcast').click()
  await expect(page.locator('.strategy-stage-grid.layout-broadcast')).toBeVisible()
  await page.getByTestId('strategy-speed-turbo').click()
  await expect(page.getByTestId('strategy-run-speed')).toContainText(/Turbo/i)

  await page.getByRole('button', { name: /^Train$/i }).click()

  await expect(page.getByTestId('strategy-training-status')).toContainText(/Training/i)
  await expect(page.locator('.training-spinner.running')).toBeVisible()
  await expect
    .poll(async () =>
      page.locator('[data-testid="strategy-progress"] .training-meter-fill').evaluate(
        (node) => Number.parseFloat((node as HTMLElement).style.width),
      ),
    )
    .toBeGreaterThan(0)

  await page.getByTestId('strategy-stop-training').click()
  await expect(page.getByTestId('strategy-training-status')).toContainText(
    /Waiting to start/i,
  )

  await page.getByRole('button', { name: /^Train$/i }).click()
  await expect(page.locator('.strategy-history-row').first()).toBeVisible({
    timeout: 12_000,
  })
  await expect(page.getByTestId('strategy-training-status')).toContainText(/Training/i)
  await page.getByTestId('strategy-stop-training').click()
  await expect(page.getByTestId('strategy-training-status')).toContainText(
    /Waiting to start/i,
  )
  await expect.poll(async () => page.locator('[data-testid="strategy-chess-viewer-select"] option').count()).toBeGreaterThan(1)

  await page.getByTestId('game-switch-connect4').click()
  await expect(page.locator('.strategy-board-connect4')).toBeVisible()
  await page.getByTestId('strategy-mode-play').click()
  await expect(page.getByTestId('strategy-connect4-opponent-select')).toBeVisible()
  await page.getByRole('button', { name: /Play first/i }).click()
  await page.locator('.strategy-board-connect4 button[title="connect4-35"]').click()
  await expect(page.getByTestId('strategy-view-mode')).toContainText(/bot turn|your turn|match finished/i)

  await page.getByTestId('game-switch-tictactoe').click()
  await expect(page.locator('.strategy-board-tictactoe')).toBeVisible()
  await page.getByTestId('strategy-mode-play').click()
  await page.getByRole('button', { name: /Play first/i }).click()
  await page.locator('.strategy-board-tictactoe button[title="tictactoe-4"]').click()
  await expect(page.getByTestId('strategy-move-count')).not.toHaveText('0')

  await page.getByTestId('game-switch-minesweeper').click()
  await expect(page.locator('.mine-grid')).toBeVisible()
  await expect(page.getByTestId('simulation-budget-meter')).toBeVisible()
  await page.getByRole('button', { name: /^Play board$/i }).click()
  await expect(page.getByTestId('preview-status')).toContainText(/manual board/i)
  await page.locator('.mine-grid .mine-cell').first().click()

  expect(consoleErrors).toEqual([])
})
