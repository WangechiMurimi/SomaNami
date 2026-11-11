import { useCallback, useState } from 'react'
import DocumentChat from './features/chat/DocumentChat.tsx'
import LibraryList from './features/library/LibraryList.tsx'
import { useLibrary } from './features/library/use-library.ts'
import DocumentCard from './features/upload/DocumentCard.tsx'
import UploadZone from './features/upload/UploadZone.tsx'
import { UploadError } from './features/upload/upload-error.ts'
import { useDocumentUpload } from './features/upload/use-document-upload.ts'
import type { StoredDocument } from './types/contracts.ts'

function App() {
  const library = useLibrary()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { add } = library

  const keepDocument = useCallback(
    async (document: StoredDocument) => {
      try {
        await add(document)
      } catch (cause) {
        // Parsing worked, so tell the user it's the saving that failed.
        throw new UploadError(
          'save-failed',
          'We read the file but couldn’t save it on this device. Free up some space and try again.',
          { retryable: true, cause },
        )
      }
      setSelectedId(document.id)
    },
    [add],
  )

  const { upload, retry, reset, ...state } = useDocumentUpload({
    onReady: keepDocument,
  })

  // Fall back to the first stored document until the learner picks one.
  const active =
    library.documents.find(({ id }) => id === selectedId) ??
    library.documents[0] ??
    null

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="font-display text-4xl leading-none font-extrabold tracking-tight">
        What did you find today?
      </h1>
      <p className="mt-3 text-muted">
        Upload a document you want to understand: class notes, a handout, an
        article or a PDF.
      </p>
      <UploadZone onFile={upload} disabled={state.status === 'processing'} />
      <DocumentCard {...state} onClear={reset} onRetry={retry} />

      {library.status === 'error' && (
        <p role="alert" className="mt-6 text-sm text-rose">
          We couldn’t open the documents saved on this device.
        </p>
      )}

      {active && (
        <section aria-labelledby="ask-heading" className="mt-10 space-y-4">
          <h2
            id="ask-heading"
            className="font-display text-2xl font-extrabold tracking-tight"
          >
            Ask about your documents
          </h2>
          {library.documents.length > 1 && (
            <LibraryList
              documents={library.documents}
              activeId={active.id}
              onSelect={setSelectedId}
            />
          )}
          {/* Keyed so switching documents starts from that document's history. */}
          <DocumentChat key={active.id} document={active} />
        </section>
      )}
    </main>
  )
}

export default App
