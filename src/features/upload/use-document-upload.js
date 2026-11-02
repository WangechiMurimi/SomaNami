import { useCallback, useRef, useState } from 'react'
import { parseDocument, UploadError } from './parse-document.js'

const IDLE = { status: 'idle', document: null, error: null }

/** Shapes any thrown value into the error the UI shows; unexpected ones are logged, not leaked. */
function toErrorState(error) {
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

/** Tracks one upload at a time: idle, processing, ready or error. */
export function useDocumentUpload() {
  const [state, setState] = useState(IDLE)
  // A newer upload supersedes a slow earlier one, so drop stale results.
  const latest = useRef(0)
  // Kept so a failed upload can be retried without re-picking the file.
  const lastFile = useRef(null)

  const upload = useCallback(async (file) => {
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
