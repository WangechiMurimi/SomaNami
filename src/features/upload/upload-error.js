/**
 * A failure we can explain to the user. `stage` separates "this file can't be
 * used" (validation) from "we tried and failed" (processing), and `retryable`
 * marks failures where retrying the same file can succeed.
 */
export class UploadError extends Error {
  constructor(
    code,
    message,
    { stage = 'processing', retryable = false, cause } = {},
  ) {
    super(message, { cause })
    this.name = 'UploadError'
    this.code = code
    this.stage = stage
    this.retryable = retryable
  }
}
