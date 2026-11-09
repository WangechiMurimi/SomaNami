import { UploadError } from './upload-error.js'

/** Lazy-loads a parser library; a failed chunk download is a network problem, not a bad file. */
export async function loadReader(importer) {
  try {
    return await importer()
  } catch (cause) {
    throw new UploadError(
      'reader-unavailable',
      'We couldn’t load the document reader. Check your connection and try again.',
      { retryable: true, cause },
    )
  }
}
