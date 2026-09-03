'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { selectSelectedAnnotation, useStore } from '@/lib/state/store'
import { deleteAnnotationCommand, setAttributeCommand } from '@/lib/state/annotation-commands'
import type { AttributeDef, AttrValue } from '@/lib/canvas/types'

/**
 * Per-annotation attribute editor.
 *
 * ---------------------------------------------------------------------------
 * THE POINT OF THIS PANEL
 * ---------------------------------------------------------------------------
 * It has no knowledge of any specific attribute. There is no branch anywhere
 * for "Liquid Level" or "State". It reads the selected annotation's class,
 * walks that class's declared attribute schema, and renders one control per
 * entry based on its `type` alone.
 *
 * That is what makes a user-defined class work with no code change: invent a
 * class with a "Temperature" number and a "Cap" enum, and the controls appear
 * because the schema says so. See spec 7.
 */
export function AttributePanel() {
  const annotation = useStore(selectSelectedAnnotation)
  const classes = useStore((s) => s.classes)

  if (!annotation) {
    return (
      <div className="px-3 py-4 text-[11px] leading-relaxed text-[var(--color-muted)]">
        Select an annotation to edit its state.
      </div>
    )
  }

  const cls = classes[annotation.classId]
  const defs = cls?.attributes ?? []

  return (
    <div className="space-y-3 px-3 py-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-text)]">
          <span
            className="inline-block h-2 w-2 rounded-sm"
            style={{ background: cls?.color ?? '#9CA3AF' }}
          />
          {cls?.name ?? 'Unknown class'}
        </span>
        <button
          onClick={() => deleteAnnotationCommand(annotation.id)}
          title="Delete annotation (Delete)"
          className="text-[var(--color-muted)] transition hover:text-[#F87171]"
        >
          <Trash2 size={13} strokeWidth={1.75} />
        </button>
      </div>

      <p className="text-[10px] text-[var(--color-muted)]">
        {annotation.geometry.kind} · {Math.round(annotation.bbox[2])}×
        {Math.round(annotation.bbox[3])}px
      </p>

      {defs.length === 0 ? (
        <p className="text-[11px] text-[var(--color-muted)]">
          This class declares no attributes.
        </p>
      ) : (
        <div className="space-y-3 pt-1">
          {defs.map((def) => (
            <AttributeRow
              key={`${annotation.id}:${def.key}`}
              annotationId={annotation.id}
              def={def}
              value={annotation.attributes[def.name]}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * One control, chosen by attribute type.
 *
 * Edits are held in local draft state and only pushed through the command stack
 * on a gesture boundary: blur, pointer release, Enter, or a discrete change.
 * Committing on every input event would put a hundred one-percent steps on the
 * undo stack for a single slider drag.
 */
function AttributeRow({
  annotationId,
  def,
  value,
}: {
  annotationId: string
  def: AttributeDef
  value: AttrValue | undefined
}) {
  const [draft, setDraft] = useState<AttrValue | undefined>(value)
  const [seen, setSeen] = useState<AttrValue | undefined>(value)

  // React's adjust-state-during-render pattern. The committed value can change
  // underneath an open control, most obviously when undo rewrites it, and the
  // draft has to follow. Doing it here rather than in an effect avoids
  // rendering one frame of stale input.
  if (value !== seen) {
    setSeen(value)
    setDraft(value)
  }

  const commit = (next: AttrValue) => setAttributeCommand(annotationId, def.name, next, value)

  const label = (
    <div className="flex items-baseline justify-between">
      <label className="eyebrow">{def.name}</label>
      {def.type === 'PERCENT' && (
        <span className="font-mono text-[10px] text-[var(--color-accent)]">
          {Number(draft ?? 0)}%
        </span>
      )}
    </div>
  )

  const field = 'w-full rounded border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1 text-[11px] text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]'

  switch (def.type) {
    case 'PERCENT':
      return (
        <div className="space-y-1">
          {label}
          <input
            type="range"
            min={0}
            max={100}
            value={Number(draft ?? 0)}
            onChange={(e) => setDraft(Number(e.target.value))}
            onPointerUp={() => commit(Number(draft ?? 0))}
            onBlur={() => commit(Number(draft ?? 0))}
            onKeyUp={() => commit(Number(draft ?? 0))}
            className="w-full accent-[var(--color-accent)]"
          />
        </div>
      )

    case 'NUMBER':
      return (
        <div className="space-y-1">
          {label}
          <input
            type="number"
            value={draft === undefined ? '' : Number(draft)}
            onChange={(e) => setDraft(e.target.value === '' ? '' : Number(e.target.value))}
            onBlur={() => draft !== '' && commit(Number(draft ?? 0))}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            className={field}
          />
        </div>
      )

    case 'ENUM':
      return (
        <div className="space-y-1">
          {label}
          <select
            value={String(draft ?? '')}
            onChange={(e) => {
              setDraft(e.target.value)
              commit(e.target.value)
            }}
            className={field}
          >
            <option value="">—</option>
            {(def.options ?? []).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      )

    case 'BOOLEAN':
      return (
        <label className="flex cursor-pointer items-center justify-between">
          <span className="eyebrow">{def.name}</span>
          <input
            type="checkbox"
            checked={Boolean(draft)}
            onChange={(e) => {
              setDraft(e.target.checked)
              commit(e.target.checked)
            }}
            className="accent-[var(--color-accent)]"
          />
        </label>
      )

    case 'TEXT':
      return (
        <div className="space-y-1">
          {label}
          <input
            type="text"
            value={String(draft ?? '')}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commit(String(draft ?? ''))}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            className={field}
          />
        </div>
      )
  }
}
