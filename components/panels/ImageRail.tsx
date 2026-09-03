'use client'

import Image from 'next/image'
import { useStore } from '@/lib/state/store'

/** Left rail: the photos in this project, and which one is being annotated. */
export function ImageRail() {
  const imageIds = useStore((s) => s.imageIds)
  const images = useStore((s) => s.images)
  const activeImageId = useStore((s) => s.activeImageId)
  const setActiveImage = useStore((s) => s.setActiveImage)
  const annotations = useStore((s) => s.annotations)
  const annotationIds = useStore((s) => s.annotationIds)

  const countFor = (imageId: string) =>
    annotationIds.reduce((n, id) => (annotations[id]?.imageId === imageId ? n + 1 : n), 0)

  return (
    <aside className="flex w-[168px] shrink-0 flex-col border-r border-[var(--color-line)] bg-[var(--color-deep)]">
      <div className="border-b border-[var(--color-line)] px-3 py-3">
        <p className="eyebrow">Dataset</p>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {imageIds.map((id) => {
          const img = images[id]
          if (!img) return null
          const active = id === activeImageId
          const count = countFor(id)

          return (
            <button
              key={id}
              onClick={() => setActiveImage(id)}
              className={`group relative block w-full overflow-hidden rounded-md border transition ${
                active
                  ? 'border-[var(--color-accent)]'
                  : 'border-[var(--color-line)] hover:border-white/25'
              }`}
            >
              <Image
                src={img.url}
                alt={img.filename}
                width={img.width}
                height={img.height}
                className="aspect-[3/2] w-full object-cover"
              />
              <span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/70 px-1.5 py-1 text-[9px] text-[var(--color-muted)]">
                <span className="truncate">{img.filename}</span>
                {count > 0 && (
                  <span className="ml-1 shrink-0 rounded-sm bg-[var(--color-primary)] px-1 text-white">
                    {count}
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}
