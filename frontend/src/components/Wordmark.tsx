/** The WATERWEAVE mark: two warp and two weft threads, one weft dyed indigo. */
export function WeaveMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="7" fill="var(--ink)" />
      <g strokeLinecap="round" strokeWidth="4.5">
        <path d="M6 11H26M6 21H26" stroke="#9aaccc" />
        <path d="M11 5V27" stroke="#eef2f1" />
        <path d="M21 5V27" stroke="#7d96ff" />
      </g>
      <path d="M18 11H24M8 21H14" stroke="var(--ink)" strokeWidth="8" />
      <path d="M17 11H25M7 21H15" stroke="#9aaccc" strokeWidth="4.5" />
    </svg>
  )
}
