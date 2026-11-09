import { Link } from 'react-router'
import { useLibraryContext } from '../features/library/library-context.ts'
import UploadSection from '../features/upload/UploadSection.tsx'
import type { DocumentKind } from '../types/contracts.ts'
import { H1, H2, LEDE } from './page-heading.ts'

const KIND_LABEL: Record<DocumentKind, string> = {
  pdf: 'PDF',
  docx: 'Word document',
  text: 'Text',
}

const HEADER =
  'px-5 py-3 text-left text-xs font-medium tracking-[0.06em] text-muted uppercase'

/** Every stored material, with a way to start asking about each. */
export default function LibraryPage() {
  const { documents, status } = useLibraryContext()

  return (
    <div className="flex flex-col gap-14">
      <div>
        <h1 className={H1}>My library</h1>
        <p className={LEDE}>
          Everything you’ve added lives here. SomaNami only answers from these
          materials.
        </p>
      </div>

      <UploadSection />

      <section
        aria-labelledby="materials-heading"
        className="flex flex-col gap-4"
      >
        <h2 id="materials-heading" className={H2}>
          Materials
        </h2>
        {status === 'loading' ? (
          <p role="status" className="text-muted">
            Opening your library…
          </p>
        ) : documents.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface p-6 text-muted">
            Nothing here yet. Upload a document above to start.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[36rem] border-collapse text-sm">
              <caption className="sr-only">Your materials</caption>
              <thead>
                <tr>
                  <th scope="col" className={HEADER}>
                    Name
                  </th>
                  <th scope="col" className={HEADER}>
                    Type
                  </th>
                  <th scope="col" className={HEADER}>
                    Passages
                  </th>
                  <th scope="col" className={HEADER}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {documents.map((document) => (
                  <tr key={document.id} className="border-t border-line">
                    <td className="max-w-[20rem] truncate px-5 py-3.5 font-medium">
                      {document.name}
                    </td>
                    <td className="px-5 py-3.5 text-muted">
                      {KIND_LABEL[document.kind]}
                    </td>
                    <td className="px-5 py-3.5 text-muted">
                      {document.chunks.length}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link
                        to={`/chat/${document.id}`}
                        className="text-[13px] font-semibold text-accent hover:underline"
                      >
                        Ask about this
                        <span className="sr-only">: {document.name}</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
