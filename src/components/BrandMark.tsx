/** The SomaNami logo tile (book on an accent square); decorative, so hidden from assistive tech. */
export default function BrandMark({ size = 39 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 39 39" aria-hidden="true">
      <rect width="39" height="39" rx="10" className="fill-accent" />
      <g
        transform="translate(9 9) scale(0.875)"
        fill="none"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-on-accent"
      >
        <path d="M12 7v14" />
        <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
      </g>
    </svg>
  )
}
