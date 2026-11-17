import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderSignedInApp } from '../features/auth/testing/render-app.tsx'
import { createMemoryAdapter, setStorageAdapter } from '../lib/storage/index.ts'

beforeEach(() => setStorageAdapter(createMemoryAdapter()))

const main = () => within(screen.getByRole('main'))

describe('Help', () => {
  it('walks through materials, asking, sources, workspaces, Recents and saving', async () => {
    await renderSignedInApp('/help')

    expect(
      main().getByRole('heading', { level: 1, name: 'How SomaNami works' }),
    ).toBeInTheDocument()
    const [topics] = main().getAllByRole('list')
    expect(
      within(topics!)
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual([
      'Adding materials',
      'Asking and following up',
      'Checking the source',
      'Workspaces',
      'Recents',
      'Saving chats',
    ])
    expect(
      within(
        await screen.findByRole('navigation', { name: 'Breadcrumb' }),
      ).getByText('Help'),
    ).toHaveAttribute('aria-current', 'page')
  })

  it('explains the labels an answer can carry', async () => {
    await renderSignedInApp('/help')

    const labels = within(
      main().getByRole('region', { name: 'What the labels on an answer mean' }),
    )
    expect(labels.getByText('From your materials')).toBeInTheDocument()
    expect(
      labels.getByText('Not answered from your materials'),
    ).toBeInTheDocument()
  })

  it('states the source scope once, with no offline or upload privacy claims', async () => {
    await renderSignedInApp('/help')

    const text = screen.getByRole('main').textContent ?? ''
    expect(text.match(/answers from the materials you add/g)).toHaveLength(1)
    expect(text).not.toMatch(
      /offline|online|on this device|private|never leaves/i,
    )
  })
})
