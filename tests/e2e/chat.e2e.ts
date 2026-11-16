import { CANNED_ANSWER } from './support/fake-backend.ts'
import { expect, signIn, test, uploadFixture } from './support/test.ts'

const QUESTION = 'Why do leaves look green?'

test.describe('Ask about a document', () => {
  test('a question about an uploaded document gets a cited answer', async ({
    page,
    backend,
  }) => {
    await signIn(page)
    await uploadFixture(page)

    // Sending from Home starts a chat over the attached file and asks the
    // question there straight away.
    await page
      .getByRole('textbox', {
        name: 'Ask a question or share what you’re reading',
      })
      .fill(QUESTION)
    await page.getByRole('button', { name: 'Send' }).click()

    const conversation = page.getByRole('region', { name: 'Conversation' })
    await expect(conversation.getByText(QUESTION)).toBeVisible()
    const answer = conversation.getByRole('article', {
      name: 'Answer from your materials',
    })
    await expect(answer).toContainText(CANNED_ANSWER)
    await expect(answer).toContainText('photosynthesis.txt')

    // Only the question, the chosen material's id and the session token go
    // to the server; no document text.
    expect(backend.chatCalls).toHaveLength(1)
    const [call] = backend.chatCalls
    expect(call!.question).toBe(QUESTION)
    expect(call!.materialIds).toHaveLength(1)
    expect(call!.authorization).toMatch(/^Bearer \S+/)
  })
})
