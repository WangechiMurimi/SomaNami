import type { ReactNode } from 'react'
import { LibraryContext } from './library-context.ts'
import { useLibrary } from './use-library.ts'

/** Loads the library once so every screen sees the same documents. */
export default function LibraryProvider({ children }: { children: ReactNode }) {
  const library = useLibrary()
  return (
    <LibraryContext.Provider value={library}>
      {children}
    </LibraryContext.Provider>
  )
}
