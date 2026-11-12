import type { DocumentKind } from '../../types/contracts.ts'

/** How each material type is named in lists and tables. */
export const KIND_LABEL: Record<DocumentKind, string> = {
  pdf: 'PDF',
  docx: 'Word document',
  text: 'Text',
}
