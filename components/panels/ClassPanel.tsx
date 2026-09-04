'use client'

import { useState } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { countAnnotationsForClass, useStore } from '@/lib/state/store'
import { ATTR_TYPE_HINTS, ATTR_TYPE_LABELS } from '@/lib/classes'
import { changeClassCommand } from '@/lib/state/annotation-commands'
import type { AttrType, AttributeDef, LabelClass } from '@/lib/canvas/types'

const SWATCHES = ['#14B8A6', '#38BDF8', '#A78BFA', '#FBBF24', '#F87171', '#F472B6', '#4ADE80', '#FB923C']
const TYPES: AttrType[] = ['TEXT', 'NUMBER', 'PERCENT', 'ENUM', 'BOOLEAN']

/**
 * The class registry.
 *
 * Each row shows the attributes that class declares, so the schema is visible
 * without having to draw a shape first. Any class can be edited, including the
 * built-in ones, which is what makes "custom attributes" true rather than a
 * claim about the create form.
 *
 * Clicking a class does one of two things by context. With an annotation
 * selected it reassigns that annotation. Otherwise it sets what the next shape
 * will be drawn as.
 */
export function ClassPanel() {
  const classIds = useStore((s) => s.classIds)
  const classes = useStore((s) => s.classes)
  const activeClassId = useStore((s) => s.activeClassId)
  const setActiveClass = useStore((s) => s.setActiveClass)
  const selectedId = useStore((s) => s.selectedId)
  const annotations = useStore((s) => s.annotations)

  const [editing, setEditing] = useState<string | null>(null)
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
          onClick={() => {
            setCreating((v) => !v)
            setEditing(null)
          }}
          title="New class"
          className="text-[var(--color-muted)] transition hover:text-[var(--color-text)]"
        >
          {creating ? <X size={13} strokeWidth={1.75} /> : <Plus size={13} strokeWidth={1.75} />}
        </button>
      </div>

      {creating && <ClassForm onDone={() => setCreating(false)} />}

      <div className="space-y-0.5 px-2 py-2">
        {classIds.map((id, i) => {
          const c = classes[id]
          if (!c) return null
          if (editing === id) {
            return <ClassForm key={id} existing={c} onDone={() => setEditing(null)} />
          }

          const active = id === highlightId

          return (
            <div
              key={id}
              className={`group rounded px-2 py-1.5 transition ${
                active ? 'bg-[var(--color-surface)]' : 'hover:bg-white/[0.03]'
              }`}
            >
              <div className="flex items-center gap-2">
                <button
                  onClick={() => pick(id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ background: c.color }}
                  />
                  <span
                    className={`flex-1 truncate text-[11px] ${
                      active ? 'text-[var(--color-text)]' : 'text-[var(--color-muted)]'
                    }`}
                  >
                    {c.name}
                  </span>
                </button>
                <button
                  onClick={() => {
                    setEditing(id)
                    setCreating(false)
                  }}
                  title="Edit class and attributes"
                  className="text-[var(--color-muted)] opacity-0 transition group-hover:opacity-100 hover:text-[var(--color-text)]"
                >
                  <Pencil size={11} strokeWidth={1.75} />
                </button>
                {i < 9 && (
                  <span className="w-2 text-right text-[9px] text-[var(--color-muted)]">
                    {i + 1}
                  </span>
                )}
              </div>

              {c.attributes.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1 pl-[18px]">
                  {c.attributes.map((a) => (
                    <span
                      key={a.key}
                      title={
                        a.options
                          ? `Pick from: ${a.options.join(', ')}`
                          : ATTR_TYPE_HINTS[a.type]
                      }
                      className="rounded-sm bg-white/[0.06] px-1 py-px text-[9px] text-[var(--color-muted)]"
                    >
                      {a.name}
                      <span className="ml-1 opacity-50">{ATTR_TYPE_LABELS[a.type].toLowerCase()}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface Row {
  name: string
  type: AttrType
  options: string
  defaultValue: string
}

function toRows(defs: AttributeDef[]): Row[] {
  return defs.map((d) => ({
    name: d.name,
    type: d.type,
    options: d.options?.join(', ') ?? '',
    defaultValue: d.defaultValue === undefined ? '' : String(d.defaultValue),
  }))
}

/** Create or edit a class and the attributes it declares. */
function ClassForm({ existing, onDone }: { existing?: LabelClass; onDone: () => void }) {
  const addClass = useStore((s) => s.addClass)
  const updateClass = useStore((s) => s.updateClass)
  const removeClass = useStore((s) => s.removeClass)
  const inUse = useStore((s) => (existing ? countAnnotationsForClass(s, existing.id) : 0))

  const [name, setName] = useState(existing?.name ?? '')
  const [color, setColor] = useState(existing?.color ?? SWATCHES[0])
  const [rows, setRows] = useState<Row[]>(existing ? toRows(existing.attributes) : [])

  const field =
    'w-full rounded border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1 text-[11px] text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]'

  function buildAttributes(): AttributeDef[] {
    return rows
      .filter((r) => r.name.trim())
      .map((r) => {
        const def: AttributeDef = { key: slug(r.name), name: r.name.trim(), type: r.type }
        if (r.type === 'ENUM') {
          def.options = r.options.split(',').map((o) => o.trim()).filter(Boolean)
        }
        if (r.defaultValue.trim()) {
          def.defaultValue =
            r.type === 'NUMBER' || r.type === 'PERCENT'
              ? Number(r.defaultValue)
              : r.type === 'BOOLEAN'
                ? r.defaultValue.trim().toLowerCase() === 'true'
                : r.defaultValue.trim()
        }
        return def
      })
  }

  function submit() {
    const trimmed = name.trim()
    if (!trimmed) return
    const attributes = buildAttributes()

    if (existing) {
      updateClass(existing.id, { name: trimmed, color, attributes })
    } else {
      addClass({
        id: `cls_${slug(trimmed)}_${Math.random().toString(36).slice(2, 7)}`,
        key: slug(trimmed),
        name: trimmed,
        color,
        attributes,
      })
    }
    onDone()
  }

  // Inline labels only on the two fields whose purpose is not obvious once
  // filled in, since a placeholder disappears as soon as there is a value.
  // Everything else is clear from its placeholder.
  const sub = 'w-11 shrink-0 text-[9px] text-[var(--color-muted)]'

  return (
    <div className="space-y-2 border-y border-[var(--color-line)] bg-[var(--color-deep)] px-3 py-3">
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
              title={ATTR_TYPE_HINTS[r.type]}
              onChange={(e) =>
                setRows(rows.map((x, j) => (j === i ? { ...x, type: e.target.value as AttrType } : x)))
              }
              className={field}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {ATTR_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <button
              onClick={() => setRows(rows.filter((_, j) => j !== i))}
              title="Remove attribute"
              className="shrink-0 px-1 text-[var(--color-muted)] transition hover:text-[#F87171]"
            >
              <X size={12} strokeWidth={1.75} />
            </button>
          </div>

          {r.type === 'ENUM' && (
            <label className="flex items-center gap-1.5">
              <span className={sub}>choices</span>
              <input
                placeholder="Open, Closed"
                value={r.options}
                onChange={(e) =>
                  setRows(rows.map((x, j) => (j === i ? { ...x, options: e.target.value } : x)))
                }
                className={field}
              />
            </label>
          )}

          <label className="flex items-center gap-1.5">
            <span className={sub}>default</span>
            <input
              placeholder="optional"
              value={r.defaultValue}
              onChange={(e) =>
                setRows(rows.map((x, j) => (j === i ? { ...x, defaultValue: e.target.value } : x)))
              }
              className={field}
            />
          </label>
        </div>
      ))}

      <button
        onClick={() => setRows([...rows, { name: '', type: 'TEXT', options: '', defaultValue: '' }])}
        className="w-full rounded border border-dashed border-[var(--color-line)] py-1 text-[10px] text-[var(--color-muted)] transition hover:text-[var(--color-text)]"
      >
        + Attribute
      </button>

      <div className="flex gap-1">
        <button
          onClick={submit}
          disabled={!name.trim()}
          className="flex-1 rounded bg-[var(--color-primary)] py-1.5 text-[11px] text-white transition hover:brightness-110 disabled:opacity-30"
        >
          {existing ? 'Save changes' : 'Create class'}
        </button>
        <button
          onClick={onDone}
          className="rounded border border-[var(--color-line)] px-2 text-[11px] text-[var(--color-muted)] transition hover:text-[var(--color-text)]"
        >
          Cancel
        </button>
      </div>

      {existing && (
        <button
          onClick={() => {
            removeClass(existing.id)
            onDone()
          }}
          disabled={inUse > 0}
          title={inUse > 0 ? `${inUse} shape(s) use this class` : 'Delete class'}
          className="flex w-full items-center justify-center gap-1.5 rounded border border-[var(--color-line)] py-1 text-[10px] text-[var(--color-muted)] transition hover:text-[#F87171] disabled:opacity-30 disabled:hover:text-[var(--color-muted)]"
        >
          <Trash2 size={11} strokeWidth={1.75} />
          {inUse > 0 ? `Used by ${inUse}` : 'Delete class'}
        </button>
      )}
    </div>
  )
}

function slug(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}
