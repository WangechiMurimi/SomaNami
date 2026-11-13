const RAW_SVG_URI = /^data:image\/svg\+xml;(?:utf-8|charset=utf-8),(<[\s\S]*)$/i

/**
 * An `<img src>` for the enrolment QR code. auth-js prefixes Supabase's raw
 * SVG with `data:image/svg+xml;utf-8,` unencoded, so a `#` or `%` in the
 * markup would end the URI early and break the image; this encodes it.
 */
export function qrImageSrc(qrCode: string): string {
  const raw = RAW_SVG_URI.exec(qrCode)?.[1]
  return raw === undefined
    ? qrCode
    : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(raw)}`
}
