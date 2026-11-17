/*
 * Change notifications per kind of record, shared by the record functions in
 * index.ts and the sync functions in sync.ts.
 */

/** A set of listeners notified after a kind of record changes. */
function createSignal() {
  const listeners = new Set<() => void>()
  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    notify(): void {
      for (const listener of listeners) listener()
    },
  }
}

const conversationSignal = createSignal()
const workspaceSignal = createSignal()
const documentSignal = createSignal()
// Storage calls these after a write; screens subscribe below.
export const notifyConversations = conversationSignal.notify
export const notifyWorkspaces = workspaceSignal.notify
export const notifyDocuments = documentSignal.notify

/**
 * Calls `listener` after any conversation is created, changed or removed, so
 * lists such as the sidebar's recent chats stay current without polling.
 * Returns the unsubscribe function.
 */
export const subscribeToConversations = conversationSignal.subscribe

/** As `subscribeToConversations`, for workspaces. */
export const subscribeToWorkspaces = workspaceSignal.subscribe

/**
 * As `subscribeToConversations`, for materials, so the Library refreshes when
 * one is saved or removed elsewhere (another screen, or a sync pull).
 */
export const subscribeToDocuments = documentSignal.subscribe
