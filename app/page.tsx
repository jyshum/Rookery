'use client'

import { useEffect } from 'react'
import { CanvasStage } from '@/components/canvas/CanvasStage'
import { ImageRail } from '@/components/panels/ImageRail'
import { StatusBar } from '@/components/panels/StatusBar'
import { useStore } from '@/lib/state/store'
import { SAMPLE_IMAGES } from '@/lib/samples'

export default function Workspace() {
  // temporary: seeded locally until the backend lands in Task 22
  useEffect(() => {
    useStore.getState().hydrate({
      images: SAMPLE_IMAGES,
      classes: [],
      annotations: [],
    })
  }, [])

  return (
    <div className="flex h-screen flex-col bg-[var(--color-bg)]">
      <header className="flex h-11 shrink-0 items-center gap-4 border-b border-[var(--color-line)] bg-[var(--color-deep)] px-3">
        <span
          className="gradient-text text-lg"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}
        >
          Rookery
        </span>
        <span className="eyebrow">Lab-Native Annotation</span>
      </header>

      <div className="flex min-h-0 flex-1">
        <ImageRail />
        <main className="min-w-0 flex-1">
          <CanvasStage />
        </main>
        <aside className="w-[260px] shrink-0 border-l border-[var(--color-line)] bg-[var(--color-panel)]">
          <div className="border-b border-[var(--color-line)] px-3 py-3">
            <p className="eyebrow">Class</p>
          </div>
        </aside>
      </div>

      <StatusBar />
    </div>
  )
}
