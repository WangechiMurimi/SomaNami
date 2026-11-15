import { useCallback, useEffect, useRef, useState } from 'react'
import type { NewDocument } from '../../types/contracts.ts'
import { fetchLink } from './fetch-link.ts'
import { parseDocument, UploadError } from './parse-document.ts'
import type { UploadStage } from './upload-error.ts'

/** The failure as the UI shows it, stripped of stack and cause. */
export interface UploadErrorState {
  code: string
  message: string
  stage: UploadStage
  retryable: boolean
}

export type UploadState =
  | { status: 'idle'; document: null; error: null }
  | {
      status: 'processing'
      document: null
      error: null
      fileName: string
      /** Set while a link is still being downloaded, before it is read. */
      fetching?: boolean
    }
  | { status: 'ready'; document: NewDocument; error: null }
  | {
      status: 'error'
      document: null
      error: UploadErrorState
      fileName: string
    }

const IDLE: UploadState = { status: 'idle', document: null, error: null }

/** Shapes any thrown value into the error the UI shows; unexpected ones are logged, not leaked. */
function toErrorState(error: unknown): UploadErrorState {
  if (error instanceof UploadError) {
    const { code, message, stage, retryable } = error
    return { code, message, stage, retryable }
  }
  // Not a failure we anticipated, so keep the details for debugging.
  console.error('Unexpected upload failure', error)
  return {
    code: 'unknown',
    message: 'Something went wrong while reading that file.',
    stage: 'processing',
    retryable: true,
  }
}

export interface UseDocumentUploadOptions {
  /**
   * Runs with each parsed document before it is shown as ready, e.g. to save
   * it. If it throws, the upload is reported as failed.
   */
  onReady?: (document: NewDocument) => void | Promise<void>
}

/** A web page with no extractable text is usually a sign-in wall or a script-only app. */
const NO_TEXT_ON_PAGE =
  'We couldn’t find readable text on that page. It may need a sign-in or build its content with scripts. Copy the text and use Paste text instead.'

/** Downloads a link and reads it like an uploaded file, keeping where it came from. */
async function parseLink(url: string): Promise<NewDocument> {
  const { file, finalUrl } = await fetchLink(url)
  try {
    return await parseDocument(file, {
      sourceUrl: finalUrl,
      fetchedAt: Date.now(),
    })
  } catch (error) {
    // The upload wording blames scanned files, which is wrong for a web page.
    if (error instanceof UploadError && error.code === 'no-text') {
      throw new UploadError('no-text', NO_TEXT_ON_PAGE, { cause: error })
    }
    throw error
  }
}

/** What to repeat on retry: a picked file or a link. */
type Source = { file: File } | { url: string }

/** Tracks one upload (a file or a link) at a time: idle, processing, ready or error. */
export function useDocumentUpload({ onReady }: UseDocumentUploadOptions = {}) {
  const [state, setState] = useState<UploadState>(IDLE)
  // A newer upload supersedes a slow earlier one, so drop stale results.
  const latest = useRef(0)
  // Kept so a failed upload can be retried without re-picking the file.
  const lastSource = useRef<Source | null>(null)
  // Read through a ref so a new callback each render doesn't recreate `upload`.
  const onReadyRef = useRef(onReady)
  useEffect(() => {
    onReadyRef.current = onReady
  }, [onReady])

  const run = useCallback(async (source: Source) => {
    lastSource.current = source
    const ticket = ++latest.current
    const fileName = 'file' in source ? source.file.name : source.url
    setState({
      status: 'processing',
      document: null,
      error: null,
      fileName,
      ...('url' in source && { fetching: true }),
    })
    try {
      const document =
        'file' in source
          ? await parseDocument(source.file)
          : await parseLink(source.url)
      if (ticket !== latest.current) return
      await onReadyRef.current?.(document)
      if (ticket === latest.current) {
        setState({ status: 'ready', document, error: null })
      }
    } catch (error) {
      if (ticket === latest.current) {
        setState({
          status: 'error',
          document: null,
          error: toErrorState(error),
          fileName,
        })
      }
    }
  }, [])

  const upload = useCallback(
    async (file: File | null | undefined) => {
      if (file) await run({ file })
    },
    [run],
  )

  /** Adds a material from an http(s) link (already normalised by the form). */
  const uploadLink = useCallback(
    async (url: string) => {
      if (url) await run({ url })
    },
    [run],
  )

  const retry = useCallback(async () => {
    if (lastSource.current) await run(lastSource.current)
  }, [run])

  const reset = useCallback(() => {
    latest.current++
    lastSource.current = null
    setState(IDLE)
  }, [])

  return { ...state, upload, uploadLink, retry, reset }
}
