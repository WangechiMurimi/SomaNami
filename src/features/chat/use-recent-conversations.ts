import { useEffect, useState } from 'react'
import {
  listRecentConversations,
  subscribeToConversations,
} from '../../lib/storage/index.ts'
import type { Conversation } from '../../types/contracts.ts'

export type RecentStatus = 'loading' | 'ready' | 'error'

/**
 * The most recently active conversations on this device. Reloads whenever a
 * conversation changes, so a question asked in one screen shows up in the
 * sidebar straight away.
 */
export function useRecentConversations(limit = Infinity) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [status, setStatus] = useState<RecentStatus>('loading')

  useEffect(() => {
    let cancelled = false
    const load = () =>
      listRecentConversations(limit)
        .then((recent) => {
          if (cancelled) return
          setConversations(recent)
          setStatus('ready')
        })
        .catch((error: unknown) => {
          if (cancelled) return
          console.error('Could not load recent conversations', error)
          setStatus('error')
        })

    void load()
    const unsubscribe = subscribeToConversations(() => void load())
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [limit])

  return { conversations, status }
}
