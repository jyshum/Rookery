'use client'

import { useEffect } from 'react'
import { CanvasStage } from '@/components/canvas/CanvasStage'
import { ImageRail } from '@/components/panels/ImageRail'
import { StatusBar } from '@/components/panels/StatusBar'
import { bootstrap } from '@/lib/state/bootstrap'
import { Toolbar } from '@/components/panels/Toolbar'
import { ClassPanel } from '@/components/panels/ClassPanel'
import { AttributePanel } from '@/components/panels/AttributePanel'
import { ExportDrawer } from '@/components/panels/ExportDrawer'
import { AnnotationList } from '@/components/panels/AnnotationList'

export default function Workspace() {
  // loads the project from the API, falling back to in-memory seed data if no
  // database is configured. See lib/state/bootstrap.ts
  useEffect(() => {
    void bootstrap()
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

      <Toolbar />

      <div className="relative flex min-h-0 flex-1">
        <ImageRail />
        <main className="min-w-0 flex-1">
          <CanvasStage />
        </main>
        <aside className="flex w-[260px] shrink-0 flex-col overflow-y-auto border-l border-[var(--color-line)] bg-[var(--color-panel)]">
          <ClassPanel />
          <div className="border-t border-[var(--color-line)]">
            <div className="border-b border-[var(--color-line)] px-3 py-3">
              <p className="eyebrow">Attributes</p>
            </div>
            <AttributePanel />
          </div>
          <div className="border-t border-[var(--color-line)]">
            <div className="border-b border-[var(--color-line)] px-3 py-3">
              <p className="eyebrow">Annotations</p>
            </div>
            <AnnotationList />
          </div>
        </aside>

        <ExportDrawer />
      </div>

      <StatusBar />
    </div>
  )
}
