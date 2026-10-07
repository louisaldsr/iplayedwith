/** A clock — marks a daily played late, from the archive. Drawn in the text's colour. */
export function ClockIcon() {
  return (
    <svg className="clock-icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <polyline points="12 7 12 12 15.5 14" />
      </g>
    </svg>
  )
}
