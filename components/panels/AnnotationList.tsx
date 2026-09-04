'use client'

import { useMemo } from 'react'
import { Trash2 } from 'lucide-react'
import { useStore } from '@/lib/state/store'
import { deleteAnnotationCommand } from '@/lib/state/annotation-commands'

/**
 * Everything drawn on the current image.
 *
 * Clicking a shape on the canvas only reaches whatever is on top, so overlapping
 * annotations are hard to get at. A list gives every shape a stable place to
 * click, and shows what has been labeled without scanning the image.
 */
export function AnnotationList() {
  const byId = useStore((s) => s.annotations)
  const allIds = useStore((s) => s.annotationIds)
  const activeImageId = useStore((s) => s.activeImageId)
  const classes = useStore((s) => s.classes)
  const selectedId = useStore((s) => s.selectedId)
  const setSelected = useStore((s) => s.setSelected)

  // Derived here rather than inside a store selector. A selector that builds a
  // new array returns a different reference every call, so the store sees the
  // snapshot change on every render and re-renders forever.
  const annotations = useMemo(() => {
    if (!activeImageId) return []
    return allIds
      .map((id) => byId[id])
      .filter((a) => a !== undefined && a.imageId === activeImageId)
  }, [allIds, byId, activeImageId])

  if (annotations.length === 0) {
    return (
      <div className="px-3 py-3 text-[11px] text-[var(--color-muted)]">
        Nothing drawn on this image yet.
      </div>
    )
  }

  return (
    <div className="space-y-0.5 px-2 py-2">
      {annotations.map((a) => {
        const cls = classes[a.classId]
        const selected = a.id === selectedId
        const attrs = Object.entries(a.attributes)

        return (
          <div
            key={a.id}
            className={`group flex items-center gap-2 rounded px-2 py-1.5 transition ${
              selected ? 'bg-[var(--color-surface)]' : 'hover:bg-white/[0.03]'
            }`}
          >
            <button
              onClick={() => setSelected(a.id)}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ background: cls?.color ?? '#9CA3AF' }}
              />
              <span className="min-w-0 flex-1">
                <span
                  className={`block truncate text-[11px] ${
                    selected ? 'text-[var(--color-text)]' : 'text-[var(--color-muted)]'
                  }`}
                >
                  {cls?.name ?? 'Unknown'}
                </span>
                {attrs.length > 0 && (
                  <span className="block truncate text-[9px] text-[var(--color-muted)]">
                    {attrs.map(([k, v]) => `${k}: ${v}`).join(' · ')}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-[9px] text-[var(--color-muted)]">
                {a.geometry.kind}
              </span>
            </button>
            <button
              onClick={() => deleteAnnotationCommand(a.id)}
              title="Delete"
              className="shrink-0 text-[var(--color-muted)] opacity-0 transition group-hover:opacity-100 hover:text-[#F87171]"
            >
              <Trash2 size={11} strokeWidth={1.75} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
