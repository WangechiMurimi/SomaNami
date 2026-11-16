import type { Chunk } from '../../types/contracts.ts'

/** What every parser returns: chunks without ids (assigned by `parseDocument`). */
export interface ParsedFile {
  chunks: Omit<Chunk, 'id'>[]
  pageCount: number | null
  /** The material's own title, when the format carries one (a web page's <title>). */
  title?: string
}

export type Parser = (file: File) => Promise<ParsedFile>
