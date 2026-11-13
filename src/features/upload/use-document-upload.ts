import { useCallback, useEffect, useRef, useState } from 'react'
import type { StoredDocument } from '../../types/contracts.ts'
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
  | { status: 'processing'; document: null; error: null; fileName: string }
  | { status: 'ready'; document: StoredDocument; error: null }
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
  onReady?: (document: StoredDocument) => void | Promise<void>
}

/** Tracks one upload at a time: idle, processing, ready or error. */
export function useDocumentUpload({ onReady }: UseDocumentUploadOptions = {}) {
  const [state, setState] = useState<UploadState>(IDLE)
  // A newer upload supersedes a slow earlier one, so drop stale results.
  const latest = useRef(0)
  // Kept so a failed upload can be retried without re-picking the file.
  const lastFile = useRef<File | null>(null)
  // Read through a ref so a new callback each render doesn't recreate `upload`.
  const onReadyRef = useRef(onReady)
  useEffect(() => {
    onReadyRef.current = onReady
  }, [onReady])

  const upload = useCallback(async (file: File | null | undefined) => {
    if (!file) return
    lastFile.current = file
    const ticket = ++latest.current
    setState({
      status: 'processing',
      document: null,
      error: null,
      fileName: file.name,
    })
    try {
      const document = await parseDocument(file)
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
          fileName: file.name,
        })
      }
    }
  }, [])

  const retry = useCallback(() => upload(lastFile.current), [upload])

  const reset = useCallback(() => {
    latest.current++
    lastFile.current = null
    setState(IDLE)
  }, [])

  return { ...state, upload, retry, reset }
}
