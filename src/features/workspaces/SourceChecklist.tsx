import KindIcon from '../library/KindIcon.tsx'
import type { StoredDocument } from '../../types/contracts.ts'

/** A multi-select list of materials, each with a line saying where it is. */
export default function SourceChecklist({
  legend,
  materials,
  selected,
  onToggle,
  detail,
}: {
  legend: string
  materials: StoredDocument[]
  selected: readonly string[]
  onToggle: (id: string) => void
  detail: (material: StoredDocument) => string
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-xs leading-[1.5] font-semibold tracking-[0.08em] text-muted uppercase">
        {legend}
      </legend>
      <ul className="flex max-h-72 flex-col divide-y divide-line overflow-y-auto rounded-xl border border-line">
        {materials.map((material) => (
          <li key={material.id}>
            <label className="flex min-h-14 cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-tint/50">
              <input
                type="checkbox"
                checked={selected.includes(material.id)}
                onChange={() => onToggle(material.id)}
                className="size-[18px] flex-none cursor-pointer accent-accent"
              />
              <KindIcon kind={material.kind} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm leading-[1.45] font-semibold">
                  {material.name}
                </span>
                <span className="text-[13px] leading-[1.5] text-muted">
                  {detail(material)}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  )
}
