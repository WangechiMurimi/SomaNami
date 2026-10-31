import { useCallback, useRef, useState } from 'react'
import { parseDocument } from './parse-document.js'

const IDLE = { status: 'idle', document: null, error: null }

/** Tracks one upload at a time: idle, processing, ready or error. */
export function useDocumentUpload() {
  const [state, setState] = useState(IDLE)
  // A newer upload supersedes a slow earlier one, so drop stale results.
  const latest = useRef(0)

  const upload = useCallback(async (file) => {
    if (!file) return
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
          error: { code: error.code ?? 'unknown', message: error.message },
          fileName: file.name,
        })
      }
    }
  }, [])

  const reset = useCallback(() => {
    latest.current++
    setState(IDLE)
  }, [])

  return { ...state, upload, reset }
}
