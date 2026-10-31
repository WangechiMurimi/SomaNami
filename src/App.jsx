import DocumentCard from './features/upload/DocumentCard.jsx'
import UploadZone from './features/upload/UploadZone.jsx'
import { useDocumentUpload } from './features/upload/use-document-upload.js'

function App() {
  const { upload, reset, ...state } = useDocumentUpload()

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
      <DocumentCard {...state} onClear={reset} />
    </main>
  )
}

export default App
