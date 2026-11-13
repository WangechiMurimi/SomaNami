import { createContext, useContext } from 'react'
import type { useLibrary } from './use-library.ts'

export type Library = ReturnType<typeof useLibrary>

export const LibraryContext = createContext<Library | null>(null)

/** The stored documents, shared by every screen under `LibraryProvider`. */
export function useLibraryContext(): Library {
  const library = useContext(LibraryContext)
  if (!library) {
    throw new Error('useLibraryContext must be used inside <LibraryProvider>')
  }
  return library
}
