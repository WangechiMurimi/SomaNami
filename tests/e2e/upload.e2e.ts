import { LEARNER } from './support/fake-backend.ts'
import { expect, signIn, test, uploadFixture } from './support/test.ts'

test.describe('Upload a document', () => {
  test('a text file is read, indexed and its original stored in the learner’s folder', async ({
    page,
    backend,
  }) => {
    await signIn(page)

    await uploadFixture(page)

    const card = page.getByRole('status').filter({ hasText: 'photosynthesis' })
    await expect(card).toContainText('Text')
    await expect(card).toContainText(/passages? indexed/)
    await expect(
      page.getByRole('link', { name: 'Ask about this' }),
    ).toBeVisible()

    // The original goes to the private bucket, under the learner's own folder.
    await expect
      .poll(() => backend.uploads.map(({ path }) => path))
      .toEqual([expect.stringMatching(`^${LEARNER.id}/.+/photosynthesis.txt$`)])
    expect(backend.uploads[0]!.authorization).toMatch(/^Bearer \S+/)

    // It is listed in the library too.
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Library' })
      .click()
    await expect(page.getByText('photosynthesis.txt').first()).toBeVisible()
  })
})
