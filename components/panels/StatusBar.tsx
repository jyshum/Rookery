'use client'

import { useStore } from '@/lib/state/store'

/** Bottom strip: counts, zoom, and save state. */
export function StatusBar() {
  const annotationIds = useStore((s) => s.annotationIds)
  const classIds = useStore((s) => s.classIds)
  const zoom = useStore((s) => s.viewport.scale)
  const brushSize = useStore((s) => s.brushSize)
  const saveStatus = useStore((s) => s.saveStatus)

  return (
    <footer className="flex h-7 shrink-0 items-center gap-5 border-t border-[var(--color-line)] bg-[var(--color-deep)] px-3 text-[10px] text-[var(--color-muted)]">
      <span>{annotationIds.length} annotations</span>
      <span>{classIds.length} classes</span>
      <span>zoom {Math.round(zoom * 100)}%</span>
      <span>brush {brushSize}px</span>
      <span className="ml-auto">{saveStatus}</span>
    </footer>
  )
}
