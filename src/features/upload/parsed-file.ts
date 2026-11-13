import type { Chunk } from '../../types/contracts.ts'

/** What every parser returns: chunks without ids (assigned by `parseDocument`). */
export interface ParsedFile {
  chunks: Omit<Chunk, 'id'>[]
  pageCount: number | null
}

export type Parser = (file: File) => Promise<ParsedFile>
