import { Link } from 'react-router'
import { ArrowRight, Trash } from '../../components/icons.tsx'
import type { StoredDocument } from '../../types/contracts.ts'
import KindIcon from './KindIcon.tsx'
import { KIND_LABEL } from './kind-label.ts'

const HEADER =
  'px-5 py-3.5 text-left text-xs font-medium tracking-[0.06em] text-muted uppercase'

/** A file row: clicking anywhere on it starts a loose chat with that file. */
function FileRow({
  material,
  workspaceName,
  onStart,
  onRemove,
}: {
  material: StoredDocument
  workspaceName: string | null
  onStart: () => void
  onRemove: () => void
}) {
  return (
    <tr
      // Mouse users can click the whole row; keyboard users get the name button.
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest('a, button')) onStart()
      }}
      className="group cursor-pointer border-t border-line transition-colors hover:bg-tint/50 focus-within:bg-tint/50"
    >
      <td className="px-5 py-2">
        <button
          type="button"
          onClick={onStart}
          className="flex min-h-11 max-w-[24rem] min-w-0 items-center gap-3 text-left text-[15px] leading-[1.5] font-medium text-fg"
        >
          <KindIcon kind={material.kind} />
          <span className="truncate group-hover:underline">
            {material.name}
          </span>
          <span className="flex flex-none items-center gap-1 rounded-full bg-tint px-2.5 py-0.5 text-xs font-semibold text-accent opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
            Start a chat
            <ArrowRight size={12} strokeWidth={2.4} />
          </span>
        </button>
      </td>
      <td className="px-5 py-3.5 text-sm text-muted">
        {KIND_LABEL[material.kind]}
      </td>
      <td className="px-5 py-3.5 text-sm text-muted">
        {workspaceName ? (
          <Link
            to={`/workspaces/${material.workspaceId}`}
            className="hover:text-fg hover:underline"
          >
            {workspaceName}
          </Link>
        ) : (
          <>
            <span aria-hidden="true">—</span>
            <span className="sr-only">Not in a workspace</span>
          </>
        )}
      </td>
      <td className="px-5 py-1.5">
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex size-11 flex-none items-center justify-center rounded-[10px] text-muted hover:bg-warn-soft hover:text-warn"
          >
            <Trash size={17} strokeWidth={1.8} />
            <span className="sr-only">Remove {material.name}</span>
          </button>
        </div>
      </td>
    </tr>
  )
}

/** The library's materials as a table, one clickable row per file. */
export default function FileTable({
  materials,
  workspaceName,
  onStart,
  onRemove,
}: {
  materials: StoredDocument[]
  /** The workspace a material is in, or `null` when it is in none. */
  workspaceName: (workspaceId: string) => string | null
  onStart: (material: StoredDocument) => void
  onRemove: (material: StoredDocument) => void
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full min-w-[40rem] border-collapse text-left">
        <caption className="sr-only">Your materials</caption>
        <thead>
          <tr>
            <th scope="col" className={`${HEADER} w-[48%]`}>
              Name
            </th>
            <th scope="col" className={`${HEADER} w-[17%]`}>
              Type
            </th>
            <th scope="col" className={`${HEADER} w-[25%]`}>
              Workspace
            </th>
            <th scope="col" className={`${HEADER} w-[10%]`}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {materials.map((document) => (
            <FileRow
              key={document.id}
              material={document}
              workspaceName={workspaceName(document.workspaceId)}
              onStart={() => onStart(document)}
              onRemove={() => onRemove(document)}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
