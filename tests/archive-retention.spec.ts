import { expect, test } from '@playwright/test'

test('connect4 archive keeps only the latest peak while preserving milestones', async ({
  page,
}) => {
  const profileId = 'connect4-archive-profile'
  const settings = {
    cycleGenerations: 12,
    selfPlayGames: 16,
    sparringGames: 8,
    learningRate: 0.22,
    exploration: 0.18,
    previewDelayMs: 110,
  }

  await page.addInitScript(
    ({ stateKey, eloMetaKey, archiveKey, profile, eloMeta, archive }) => {
      window.localStorage.clear()
      window.localStorage.setItem(
        stateKey,
        JSON.stringify({
          profiles: [profile],
          activeProfileId: profile.id,
        }),
      )
      window.localStorage.setItem(eloMetaKey, JSON.stringify(eloMeta))
      window.localStorage.setItem(archiveKey, JSON.stringify(archive))
    },
    {
      stateKey: 'ai-arena-strategy-v1-connect4',
      eloMetaKey: 'ai-arena-strategy-elo-meta-v1-connect4',
      archiveKey: 'ai-arena-strategy-archive-v1-connect4',
      profile: {
        id: profileId,
        name: 'Atlas-01',
        archetype: 'Center Ladder',
        createdAt: 1_713_523_200_000,
        rating: 1580,
        weights: [0.31, 0.44, 0.39, 0.52],
        settings,
        history: [],
      },
      eloMeta: {
        [profileId]: {
          currentElo: 1700,
          calibratedElo: 1688,
          peakElo: 1700,
          lastCalibratedAt: 1_713_523_240_000,
          archivedMilestones: [400, 600, 800, 1000, 1200, 1400, 1600],
        },
      },
      archive: [
        {
          id: 'peak-old',
          profileId,
          name: 'Atlas-01',
          archetype: 'Center Ladder',
          snapshotType: 'peak',
          elo: 1490,
          milestone: 1490,
          generation: 7,
          createdAt: 1_713_523_210_000,
          weights: [0.28, 0.42, 0.34, 0.47],
          settings,
          note: 'Old peak that should be replaced.',
        },
        {
          id: 'milestone-1400',
          profileId,
          name: 'Atlas-01',
          archetype: 'Center Ladder',
          snapshotType: 'milestone',
          elo: 1412,
          milestone: 1400,
          generation: 10,
          createdAt: 1_713_523_220_000,
          weights: [0.29, 0.43, 0.37, 0.49],
          settings,
          note: 'Milestone should remain in the archive.',
        },
        {
          id: 'peak-new',
          profileId,
          name: 'Atlas-01',
          archetype: 'Center Ladder',
          snapshotType: 'peak',
          elo: 1620,
          milestone: 1620,
          generation: 12,
          createdAt: 1_713_523_230_000,
          weights: [0.33, 0.46, 0.41, 0.54],
          settings,
          note: 'Latest peak that should stay.',
        },
      ],
    },
  )

  await page.goto('/')
  await page.getByTestId('game-switch-connect4').click()

  const viewerOptions = page.locator('[data-testid="strategy-connect4-viewer-select"] option')
  await expect(viewerOptions).toHaveCount(3)

  const optionTexts = await viewerOptions.allTextContents()
  expect(optionTexts.filter((text) => text.startsWith('Peak '))).toHaveLength(1)
  expect(optionTexts).toContain('Peak 1620 ELO - G012')
  expect(optionTexts).toContain('Milestone 1400 - G010')
  expect(optionTexts).not.toContain('Peak 1490 ELO - G007')

  await expect(page.locator('.elo-option-list')).toContainText('Peak 1620 ELO - G012')
  await expect(page.locator('.elo-option-list')).toContainText('Milestone 1400 - G010')
  await expect(page.locator('.elo-option-list')).not.toContainText('Peak 1490 ELO - G007')
})
