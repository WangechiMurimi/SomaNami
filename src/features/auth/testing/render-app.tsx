import { render, screen } from '@testing-library/react'
import { onTestFinished } from 'vitest'
import App from '../../../App.tsx'
import { setSupabaseClient } from '../../../lib/auth/supabase-client.ts'
import { fakeSession, installFakeSupabase } from './fake-supabase.ts'

/**
 * Renders the whole app as a signed-in user and waits for the saved session
 * to be restored, since every screen sits behind sign-in. Pass `path` to
 * open a screen other than the current URL.
 */
export async function renderSignedInApp(path?: string) {
  installFakeSupabase({ session: fakeSession() })
  // Later tests must not inherit this session.
  onTestFinished(() => setSupabaseClient(undefined))
  if (path) window.history.pushState({}, '', path)
  const view = render(<App />)
  await screen.findByRole('navigation', { name: 'Main' })
  return view
}
