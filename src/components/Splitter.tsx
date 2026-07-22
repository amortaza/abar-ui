import { useCallback, useRef } from 'react'
import './Splitter.css'

interface SplitterProps {
  /** Called with the new left-pane width in pixels as the user drags. */
  onResize: (width: number) => void
  /** Current left-pane width (used to seed drag math). */
  width: number
  min?: number
  max?: number
}

/**
 * A thin draggable vertical bar that resizes the pane to its left.
 * Uses pointer capture so the drag keeps tracking even if the cursor
 * leaves the bar element.
 */
export default function Splitter({
  onResize,
  width,
  min = 240,
  max,
}: SplitterProps) {
  const startX = useRef(0)
  const startWidth = useRef(width)

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      ;(e.target as HTMLDivElement).setPointerCapture(e.pointerId)
      startX.current = e.clientX
      startWidth.current = width

      const move = (clientX: number) => {
        const delta = clientX - startX.current
        const next = startWidth.current + delta
        const effectiveMax =
          max ?? Math.max(min + 1, window.innerWidth * 0.8)
        onResize(Math.min(effectiveMax, Math.max(min, next)))
      }

      const onMove = (ev: PointerEvent) => move(ev.clientX)
      const onUp = () => {
        ;(e.target as HTMLDivElement).releasePointerCapture(e.pointerId)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [width, min, max, onResize],
  )

  return (
    <div
      className="splitter"
      role="separator"
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
    />
  )
}
