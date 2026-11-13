export type UploadStage = 'validation' | 'processing'

export interface UploadErrorOptions {
  stage?: UploadStage
  retryable?: boolean
  cause?: unknown
}

/**
 * A failure we can explain to the user. `stage` separates "this file can't be
 * used" (validation) from "we tried and failed" (processing), and `retryable`
 * marks failures where retrying the same file can succeed.
 */
export class UploadError extends Error {
  readonly code: string
  readonly stage: UploadStage
  readonly retryable: boolean

  constructor(
    code: string,
    message: string,
    { stage = 'processing', retryable = false, cause }: UploadErrorOptions = {},
  ) {
    super(message, { cause })
    this.name = 'UploadError'
    this.code = code
    this.stage = stage
    this.retryable = retryable
  }
}
