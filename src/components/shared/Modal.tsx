'use client'

import { MouseEvent, ReactNode, useEffect, useRef } from 'react'

type Props = {
  open: boolean
  /**
   * Runs whenever the dialog closes — its own button, Escape, or a click on the backdrop. Also
   * runs after the parent sets `open` to false, so it must be idempotent (setting state to false
   * again is).
   */
  onClose: () => void
  /** Id of the element that names the dialog, for screen readers. */
  labelledBy: string
  className?: string
  children: ReactNode
}

/**
 * A native `<dialog>` opened with `showModal()`: focus is trapped inside, Escape closes it, the
 * page behind is inert and the backdrop comes from `::backdrop` — no dependency needed. Every way
 * of closing it goes through the `close` event, so `onClose` sees them all.
 */
export function Modal({ open, onClose, labelledBy, className, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  // The body fills the <dialog> (it has no padding of its own), so a click whose target is the
  // <dialog> element itself landed on the backdrop around it.
  const handleClick = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) e.currentTarget.close()
  }

  return (
    <dialog
      ref={ref}
      className={className ? `modal ${className}` : 'modal'}
      aria-labelledby={labelledBy}
      onClose={onClose}
      onClick={handleClick}
    >
      <div className="modal__body">{children}</div>
    </dialog>
  )
}
