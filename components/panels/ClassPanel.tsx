'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useStore } from '@/lib/state/store'
import { changeClassCommand } from '@/lib/state/annotation-commands'
import type { AttrType, AttributeDef } from '@/lib/canvas/types'

const SWATCHES = ['#14B8A6', '#38BDF8', '#A78BFA', '#FBBF24', '#F87171', '#F472B6', '#4ADE80', '#FB923C']

const TYPES: AttrType[] = ['TEXT', 'NUMBER', 'PERCENT', 'ENUM', 'BOOLEAN']

/**
 * The class registry.
 *
 * Clicking a class does one of two things depending on context: with an
 * annotation selected it reassigns that annotation, otherwise it sets which
 * class the next shape will be drawn as. Same control, because "what is this"
 * is the same question whether you are about to draw or looking at a shape.
 */
export function ClassPanel() {
  const classIds = useStore((s) => s.classIds)
  const classes = useStore((s) => s.classes)
  const activeClassId = useStore((s) => s.activeClassId)
  const setActiveClass = useStore((s) => s.setActiveClass)
  const selectedId = useStore((s) => s.selectedId)
  const annotations = useStore((s) => s.annotations)

  const [creating, setCreating] = useState(false)

  const selected = selectedId ? annotations[selectedId] : null
  const highlightId = selected ? selected.classId : activeClassId

  function pick(id: string) {
    if (selected) changeClassCommand(selected.id, id)
    else setActiveClass(id)
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b border-[var(--color-line)] px-3 py-3">
        <p className="eyebrow">{selected ? 'Reassign class' : 'Draw as'}</p>
        <button
          onClick={() => setCreating((v) => !v)}
          title="New class"
          className="text-[var(--color-muted)] transition hover:text-[var(--color-text)]"
        >
          {creating ? <X size={13} strokeWidth={1.75} /> : <Plus size={13} strokeWidth={1.75} />}
        </button>
      </div>

      {creating && <NewClassForm onDone={() => setCreating(false)} />}

      <div className="space-y-0.5 px-2 py-2">
        {classIds.map((id, i) => {
          const c = classes[id]
          if (!c) return null
          const active = id === highlightId

          return (
            <button
              key={id}
              onClick={() => pick(id)}
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] transition ${
                active
                  ? 'bg-[var(--color-surface)] text-[var(--color-text)]'
                  : 'text-[var(--color-muted)] hover:bg-white/[0.03] hover:text-[var(--color-text)]'
              }`}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ background: c.color }}
              />
              <span className="flex-1 truncate">{c.name}</span>
              {c.attributes.length > 0 && (
                <span className="text-[9px] text-[var(--color-muted)]">
                  {c.attributes.length}
                </span>
              )}
              {i < 9 && <span className="text-[9px] text-[var(--color-muted)]">{i + 1}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Create a class and its attribute schema at runtime.
 *
 * The attribute rows here are the whole feature in miniature: whatever you
 * declare, the attribute panel will render controls for, with no code change
 * anywhere.
 */
function NewClassForm({ onDone }: { onDone: () => void }) {
  const addClass = useStore((s) => s.addClass)
  const [name, setName] = useState('')
  const [color, setColor] = useState(SWATCHES[0])
  const [rows, setRows] = useState<Array<{ name: string; type: AttrType; options: string }>>([])

  const field =
    'w-full rounded border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1 text-[11px] text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]'

  function submit() {
    const trimmed = name.trim()
    if (!trimmed) return

    const attributes: AttributeDef[] = rows
      .filter((r) => r.name.trim())
      .map((r) => ({
        key: slug(r.name),
        name: r.name.trim(),
        type: r.type,
        ...(r.type === 'ENUM'
          ? { options: r.options.split(',').map((o) => o.trim()).filter(Boolean) }
          : {}),
      }))

    addClass({
      id: `cls_${slug(trimmed)}_${Math.random().toString(36).slice(2, 7)}`,
      key: slug(trimmed),
      name: trimmed,
      color,
      attributes,
    })
    onDone()
  }

  return (
    <div className="space-y-2 border-b border-[var(--color-line)] bg-[var(--color-deep)] px-3 py-3">
      <input
        autoFocus
        placeholder="Class name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={field}
      />

      <div className="flex gap-1">
        {SWATCHES.map((s) => (
          <button
            key={s}
            onClick={() => setColor(s)}
            className={`h-4 w-4 rounded-sm transition ${color === s ? 'ring-1 ring-white' : ''}`}
            style={{ background: s }}
          />
        ))}
      </div>

      {rows.map((r, i) => (
        <div key={i} className="space-y-1 rounded border border-[var(--color-line)] p-1.5">
          <div className="flex gap-1">
            <input
              placeholder="Attribute"
              value={r.name}
              onChange={(e) =>
                setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
              }
              className={field}
            />
            <select
              value={r.type}
              onChange={(e) =>
                setRows(
                  rows.map((x, j) => (j === i ? { ...x, type: e.target.value as AttrType } : x)),
                )
              }
              className={field}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.toLowerCase()}
                </option>
              ))}
            </select>
          </div>
          {r.type === 'ENUM' && (
            <input
              placeholder="Options, comma separated"
              value={r.options}
              onChange={(e) =>
                setRows(rows.map((x, j) => (j === i ? { ...x, options: e.target.value } : x)))
              }
              className={field}
            />
          )}
        </div>
      ))}

      <button
        onClick={() => setRows([...rows, { name: '', type: 'TEXT', options: '' }])}
        className="w-full rounded border border-dashed border-[var(--color-line)] py-1 text-[10px] text-[var(--color-muted)] transition hover:text-[var(--color-text)]"
      >
        + Attribute
      </button>

      <button
        onClick={submit}
        disabled={!name.trim()}
        className="w-full rounded bg-[var(--color-primary)] py-1.5 text-[11px] text-white transition hover:brightness-110 disabled:opacity-30"
      >
        Create class
      </button>
    </div>
  )
}

function slug(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}
