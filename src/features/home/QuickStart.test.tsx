import { readFileSync } from 'node:fs'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderSignedInApp } from '../auth/testing/render-app.tsx'
import {
  createMemoryAdapter,
  DEFAULT_WORKSPACE,
  listRecentConversations,
  listWorkspaceDocuments,
  setStorageAdapter,
} from '../../lib/storage/index.ts'
import type { ChatReply, ChatRequest } from '../../types/contracts.ts'

beforeEach(() => {
  setStorageAdapter(createMemoryAdapter())
  window.history.pushState({}, '', '/')
})

afterEach(() => vi.restoreAllMocks())

const start = () => within(screen.getByRole('region', { name: 'Start a chat' }))
const question = () =>
  start().getByLabelText('Ask a question or share what you’re reading')
const send = () => start().getByRole('button', { name: 'Send' })
const files = () =>
  within(start().getByRole('list', { name: 'Attached files' }))

async function attach(container: HTMLElement, file: File) {
  const picker =
    container.querySelector<HTMLInputElement>('input[type="file"]')!
  await userEvent.upload(picker, file)
}

const cells = () => new File(['Mitochondria produce ATP.'], 'cells.txt')

/** Answers every /api/chat call with its first passage, recording requests. */
function serveChat() {
  const requests: ChatRequest[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const request = JSON.parse(String(init?.body)) as ChatRequest
    requests.push(request)
    const reply: ChatReply = {
      answer: 'From your notes.',
      answerable: true,
      citations: request.passages.slice(0, 1),
    }
    return Response.json(reply)
  })
  return requests
}

describe('Home quick start', () => {
  it('needs a file before it can send', async () => {
    await renderSignedInApp()
    await userEvent.type(question(), 'Why?')

    expect(send()).toBeDisabled()
    expect(send()).toHaveAccessibleDescription(
      'Attach a file first, so there’s something to answer from.',
    )
  })

  it('needs a question once a file is attached', async () => {
    const { container } = await renderSignedInApp()
    await attach(container, cells())
    await files().findByRole('button', { name: 'Remove cells.txt' })

    expect(send()).toBeDisabled()
    expect(send()).toHaveAccessibleDescription('Type a question to send.')
    await userEvent.type(question(), 'What makes ATP?')
    expect(send()).toBeEnabled()
  })

  it('shows the uploaded file inside the box, with no file details', async () => {
    const { container } = await renderSignedInApp()
    await attach(container, cells())

    const box = container.querySelector('form.composer')!
    const remove = await files().findByRole('button', {
      name: 'Remove cells.txt',
    })
    expect(box).toContainElement(remove)
    expect(files().queryByTestId('attachment-ghost')).not.toBeInTheDocument()
    expect(
      (await listWorkspaceDocuments(DEFAULT_WORKSPACE.id)).map(
        ({ name }) => name,
      ),
    ).toEqual(['cells.txt'])
    // No file details or indexing states any more.
    expect(screen.queryByText(/Ready to explore/)).not.toBeInTheDocument()
    expect(screen.queryByText(/indexed/)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Ask about this' }),
    ).not.toBeInTheDocument()
  })

  it('removes an attached file from the box and the library', async () => {
    const { container } = await renderSignedInApp()
    await attach(container, cells())

    await userEvent.click(
      await files().findByRole('button', { name: 'Remove cells.txt' }),
    )

    expect(
      start().queryByRole('list', { name: 'Attached files' }),
    ).not.toBeInTheDocument()
    await vi.waitFor(async () =>
      expect(await listWorkspaceDocuments(DEFAULT_WORKSPACE.id)).toEqual([]),
    )
  })

  it('shows a failed file on its chip, with a retry', async () => {
    const { container } = await renderSignedInApp()
    await attach(container, new File([''], 'empty.txt'))

    const chip = within(
      (await files().findByRole('alert')).closest('li') as HTMLElement,
    )
    expect(chip.getByText('empty.txt')).toBeInTheDocument()
    expect(
      chip.getByRole('button', { name: 'Remove empty.txt' }),
    ).toBeInTheDocument()
    expect(send()).toBeDisabled()
  })

  it('adds pasted text as an attached file', async () => {
    await renderSignedInApp()

    await userEvent.click(start().getByRole('button', { name: 'Paste text' }))
    await userEvent.type(
      start().getByLabelText('Text'),
      'Ribosomes make proteins.',
    )
    await userEvent.click(start().getByRole('button', { name: 'Add text' }))

    expect(
      await files().findByRole('button', { name: 'Remove Pasted text.txt' }),
    ).toBeInTheDocument()
  })

  it('starts a loose chat over the attached files and asks straight away', async () => {
    const requests = serveChat()
    const { container, unmount } = await renderSignedInApp()
    await attach(container, cells())
    await files().findByRole('button', { name: 'Remove cells.txt' })

    await userEvent.type(question(), 'What makes ATP?{Enter}')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'What makes ATP?' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('From your notes.')).toBeInTheDocument()
    const [chat] = await listRecentConversations()
    expect(chat).toMatchObject({
      workspaceId: DEFAULT_WORKSPACE.id,
      title: 'What makes ATP?',
    })
    expect(window.location.pathname).toBe(`/chats/${chat!.id}`)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.question).toBe('What makes ATP?')
    expect(
      screen.queryByRole('heading', {
        name: 'What would you like to understand?',
      }),
    ).not.toBeInTheDocument()

    // Reloading the chat shows the answer again without asking twice.
    unmount()
    await renderSignedInApp(window.location.pathname)
    expect(await screen.findByText('From your notes.')).toBeInTheDocument()
    expect(requests).toHaveLength(1)
  })

  it('glows when active instead of drawing a separate outline', () => {
    // jsdom applies no stylesheets, so check the rule itself.
    const css = readFileSync('src/components/composer.css', 'utf8')
    const active = css.slice(css.indexOf('.composer:focus-within'))
    expect(active).toMatch(/outline: none/)
    expect(active).toMatch(/box-shadow:/)
  })

  it('keeps one light grounding line and no privacy copy', async () => {
    await renderSignedInApp()

    const main = screen.getByRole('main')
    expect(
      within(main).getByText(/stays grounded in your materials/),
    ).toBeInTheDocument()
    expect(main).not.toHaveTextContent(/offline|private|on your device/i)
  })

  it('sets the heading, the grounding note and the composer in order', async () => {
    await renderSignedInApp()

    const main = screen.getByRole('main')
    const heading = within(main).getByRole('heading', {
      level: 1,
      name: 'What would you like to explore today?',
    })
    const note = within(main).getByText(/stays grounded in your materials/)
    const composer = screen.getByRole('region', { name: 'Start a chat' })
    expect(
      heading.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      note.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})
