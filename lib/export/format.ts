/**
 * Pretty-print the export, keeping number arrays on one line.
 *
 * `JSON.stringify(doc, null, 2)` puts every array element on its own line. A
 * mask's run-length encoding is often a thousand integers, so one annotation
 * turns into a thousand lines and the structure around it becomes unreadable.
 *
 * Numbers carry no structure worth indenting. Collapsing arrays that hold only
 * numbers, or only pairs of numbers, keeps the document's shape visible while
 * the bulk data stays out of the way. The parsed result is identical either way.
 */
export function formatExport(value: unknown): string {
  return render(value, 0)
}

const INDENT = '  '

function render(value: unknown, depth: number): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)

  const pad = INDENT.repeat(depth)
  const padInner = INDENT.repeat(depth + 1)

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    if (isFlatNumbers(value) || isNumberPairs(value)) return inline(value)

    // short lists of plain values, such as enum options, read better on one line
    if (isPrimitives(value)) {
      const oneLine = inline(value)
      if (oneLine.length <= 72) return oneLine
    }

    const items = value.map((v) => padInner + render(v, depth + 1))
    return `[\n${items.join(',\n')}\n${pad}]`
  }

  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) return '{}'

  const lines = entries.map(([k, v]) => `${padInner}${JSON.stringify(k)}: ${render(v, depth + 1)}`)
  return `{\n${lines.join(',\n')}\n${pad}}`
}

function isPrimitives(arr: unknown[]): boolean {
  return arr.every((v) => v === null || typeof v !== 'object')
}

function isFlatNumbers(arr: unknown[]): boolean {
  return arr.every((v) => typeof v === 'number')
}

/** `[[x, y], [x, y], ...]`, which is how polygon points are serialized. */
function isNumberPairs(arr: unknown[]): boolean {
  return arr.every((v) => Array.isArray(v) && v.length <= 4 && isFlatNumbers(v))
}

function inline(arr: unknown[]): string {
  return `[${arr.map((v) => (Array.isArray(v) ? inline(v) : JSON.stringify(v))).join(', ')}]`
}
