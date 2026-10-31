/** Human-readable file size, matching the mockup's KB/MB wording. */
export function formatSize(bytes) {
  const kb = bytes / 1024
  return kb > 1024
    ? `${(kb / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(kb))} KB`
}
