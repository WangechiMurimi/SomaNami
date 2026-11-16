import { fileURLToPath } from 'node:url'
import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { installFakeBackend, LEARNER } from './fake-backend.ts'
import type { FakeBackend } from './fake-backend.ts'

/** A small plain-text study note; no real learner material. */
export const FIXTURE_DOCUMENT = fileURLToPath(
  new URL('../fixtures/photosynthesis.txt', import.meta.url),
)

/**
 * Every test gets the fake backend installed before the first navigation,
 * and fails if the app called anything the stubs don't recognise.
 */
export const test = base.extend<{ backend: FakeBackend }>({
  backend: [
    async ({ page }, use) => {
      const backend = await installFakeBackend(page)
      await use(backend)
      expect(backend.unexpected, 'requests with no stub').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

/** Signs in through the real form and waits for the home screen. */
export async function signIn(page: Page) {
  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(LEARNER.email)
  await page.getByLabel('Password', { exact: true }).fill(LEARNER.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(
    page.getByRole('heading', {
      name: 'What would you like to explore today?',
    }),
  ).toBeVisible()
}

/**
 * Attaches the fixture in Home's composer and waits until it is read and
 * saved: only a finished attachment's chip offers a Remove button.
 */
export async function uploadFixture(page: Page) {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Upload files' }).click()
  await (await chooser).setFiles(FIXTURE_DOCUMENT)
  await expect(
    page
      .getByRole('list', { name: 'Attached files' })
      .getByRole('button', { name: 'Remove photosynthesis.txt' }),
  ).toBeVisible()
}
