import { LEARNER } from './support/fake-backend.ts'
import { expect, signIn, test } from './support/test.ts'

test.describe('Sign in', () => {
  test('a signed-out visitor is sent to sign in, then lands on home', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/sign-in/)

    await signIn(page)

    await expect(page).toHaveURL(/\/$/)
    await expect(
      page.getByRole('button', { name: `${LEARNER.email}, account menu` }),
    ).toBeVisible()
  })

  test('wrong credentials show an error and stay on sign in', async ({
    page,
  }) => {
    await page.goto('/sign-in')
    await page.getByLabel('Email').fill(LEARNER.email)
    await page.getByLabel('Password', { exact: true }).fill('not the password')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()

    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page).toHaveURL(/\/sign-in/)
  })
})
