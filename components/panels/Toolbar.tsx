'use client'

import { useEffect, useState } from 'react'
import { MousePointer2, Square, PenTool, Brush, Eraser, Undo2, Redo2, Download } from 'lucide-react'
import { commandStack, useStore } from '@/lib/state/store'
import type { ToolId } from '@/lib/canvas/types'

const TOOLS: Array<{ id: ToolId; icon: typeof Square; label: string; key: string }> = [
  { id: 'select', icon: MousePointer2, label: 'Select', key: 'V' },
  { id: 'box', icon: Square, label: 'Box', key: 'B' },
  { id: 'polygon', icon: PenTool, label: 'Polygon', key: 'P' },
  { id: 'brush', icon: Brush, label: 'Brush', key: 'D' },
  { id: 'erase', icon: Eraser, label: 'Erase', key: 'E' },
]

export function Toolbar() {
  const tool = useStore((s) => s.tool)
  const annotationCount = useStore((s) => s.annotationIds.length)
  const setTool = useStore((s) => s.setTool)
  const setExportOpen = useStore((s) => s.setExportOpen)
  const brushSize = useStore((s) => s.brushSize)
  const classes = useStore((s) => s.classes)
  const activeClassId = useStore((s) => s.activeClassId)
  const selectedId = useStore((s) => s.selectedId)
  const annotations = useStore((s) => s.annotations)
  const setBrushSize = useStore((s) => s.setBrushSize)

  // the command stack lives outside the store, so subscribe to it directly
  // rather than re-reading it on every render
  const [, forceUpdate] = useState(0)
  useEffect(() => commandStack.subscribe(() => forceUpdate((n) => n + 1)), [])

  // what a new shape will be labelled as, or what the selected one already is
  const selected = selectedId ? annotations[selectedId] : null
  const shownClass = classes[selected ? selected.classId : (activeClassId ?? '')]

  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-b border-[var(--color-line)] bg-[var(--color-deep)] px-3">
      {TOOLS.map(({ id, icon: Icon, label, key }) => (
        <button
          key={id}
          onClick={() => setTool(id)}
          title={`${label} (${key})`}
          className={`flex h-7 w-7 items-center justify-center rounded transition ${
            tool === id
              ? 'bg-[var(--color-primary)] text-white'
              : 'text-[var(--color-muted)] hover:bg-white/5 hover:text-[var(--color-text)]'
          }`}
        >
          <Icon size={14} strokeWidth={1.75} />
        </button>
      ))}

      <div className="mx-2 h-4 w-px bg-[var(--color-line)]" />

      {shownClass && (
        <div
          className="flex items-center gap-1.5 pr-2"
          title={
            selected
              ? 'The selected shape is labelled as this'
              : 'New shapes will be labelled as this. Pick another in the class list.'
          }
        >
          <span className="eyebrow">{selected ? 'Selected' : 'Drawing'}</span>
          <span
            className="h-2.5 w-2.5 rounded-sm"
            style={{ background: shownClass.color }}
          />
          <span className="text-[11px] text-[var(--color-text)]">{shownClass.name}</span>
          <div className="mx-1 h-4 w-px bg-[var(--color-line)]" />
        </div>
      )}

      {/* only meaningful while painting, so it appears with those tools */}
      {(tool === 'brush' || tool === 'erase') && (
        <div className="flex items-center gap-2 pr-2">
          <span className="eyebrow">Size</span>
          <input
            type="range"
            min={1}
            max={120}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            title="Brush size ( [ and ] )"
            className="w-24 accent-[var(--color-accent)]"
          />
          <span className="w-8 font-mono text-[10px] text-[var(--color-accent)]">
            {brushSize}px
          </span>
          <div className="mx-1 h-4 w-px bg-[var(--color-line)]" />
        </div>
      )}

      <button
        onClick={() => commandStack.undo()}
        disabled={!commandStack.canUndo}
        title="Undo (Cmd+Z)"
        className="flex h-7 w-7 items-center justify-center rounded text-[var(--color-muted)] transition hover:bg-white/5 hover:text-[var(--color-text)] disabled:opacity-25 disabled:hover:bg-transparent"
      >
        <Undo2 size={14} strokeWidth={1.75} />
      </button>
      <button
        onClick={() => commandStack.redo()}
        disabled={!commandStack.canRedo}
        title="Redo (Cmd+Shift+Z)"
        className="flex h-7 w-7 items-center justify-center rounded text-[var(--color-muted)] transition hover:bg-white/5 hover:text-[var(--color-text)] disabled:opacity-25 disabled:hover:bg-transparent"
      >
        <Redo2 size={14} strokeWidth={1.75} />
      </button>

      <button
        onClick={() => setExportOpen(true)}
        disabled={annotationCount === 0}
        title="Export JSON"
        className="ml-auto flex h-7 items-center gap-1.5 rounded bg-[var(--color-accent)] px-2.5 text-[11px] font-medium text-black transition hover:brightness-110 disabled:opacity-30 disabled:hover:brightness-100"
      >
        <Download size={13} strokeWidth={2} />
        Export
      </button>
    </div>
  )
}
