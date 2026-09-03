# Rookery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox
> (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-based lab image annotation tool that produces structured JSON
training data, with a hand-rolled layered Canvas2D renderer and command-stack undo.

**Architecture:** Four stacked canvases split by lifetime (permanent vs temporary) so the
photo is never repainted during interaction. A normalized Zustand store holds annotation
data; React renders only the surrounding panels while an imperative rAF loop drives the
canvas. Undo is a command stack, and brush strokes are stored as vector paths with periodic
mask snapshots so undo cost stays constant. Persistence is local-first with a debounced
batched sync to Postgres.

**Tech Stack:** Next.js 16 (App Router, TypeScript), Tailwind v4, shadcn/ui, Lucide, Zustand,
Vitest, Prisma, Supabase (Postgres + Storage), Vercel.

**Spec:** `docs/specs/2026-09-02-rookery-design.md`

---

## Ground rules for this plan

**Commits are Jared's.** Every task ends with a commit command in a fenced bash block. Do not
run `git commit` on his behalf. Present the command; he runs it.

**Testing strategy.** Pure logic gets real TDD: geometry, hit testing, path simplification,
RLE encoding, the mask buffer, the command stack, and the export builder. That is where bugs
actually hide and where tests pay for themselves. Canvas rendering and React panels get
manual verification checkpoints instead, because asserting on pixels is brittle and slow.
This split is deliberate and worth stating in the architecture doc.

**Run tests with:** `npx vitest run <path>`

---

## File structure

```
app/
  layout.tsx                          fonts, html shell
  page.tsx                            the workspace
  globals.css                         theme tokens
  api/
    projects/[id]/route.ts            load project bundle
    projects/[id]/export/route.ts     export JSON
    images/upload/route.ts            file -> Storage, row -> Postgres
    images/[id]/annotations/sync/route.ts   batched write
    classes/route.ts                  list, create
    classes/[id]/route.ts             update, delete
lib/
  canvas/
    types.ts          shared geometry and annotation types
    geometry.ts       bbox, point-in-polygon, distance to segment
    transform.ts      viewport pan/zoom, screen<->image conversion
    hit-test.ts       spatial grid + topmost-hit resolution
    simplify.ts       Ramer-Douglas-Peucker
    rle.ts            mask run-length encode/decode
    mask-buffer.ts    mask bitmap, stroke replay, snapshot ring
    renderer.ts       rAF loop, dirty flags, layer dispatch
    layers/
      image-layer.ts
      vector-layer.ts
      mask-layer.ts
      interaction-layer.ts
    tools/
      box-tool.ts
      polygon-tool.ts
      brush-tool.ts
      select-tool.ts
  state/
    store.ts          zustand root, normalized
    commands.ts       Command interface + CommandStack
    sync.ts           debounced batch sync
  db/
    prisma.ts
    supabase.ts
  export/
    build-export.ts   pure: store state -> export JSON
components/
  canvas/CanvasStage.tsx    owns the four canvas elements + renderer lifecycle
  panels/Toolbar.tsx
  panels/ImageRail.tsx
  panels/ClassPanel.tsx
  panels/AttributePanel.tsx
  panels/StatusBar.tsx
  ui/                       shadcn primitives
prisma/
  schema.prisma
  seed.ts
public/samples/             bundled lab photos
docs/ARCHITECTURE.md        the written deliverable
```

Split by responsibility, not by layer. Each canvas layer owns one draw function. Each tool
owns its own pointer handling. Neither knows about the other.

---

## Task 1: Scaffold and theme tokens

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `app/layout.tsx`, `app/globals.css`
- Create: `vitest.config.ts`

- [ ] **Step 1: Scaffold Next.js**

```bash
cd ~/Desktop/code-folders/rookery
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias "@/*" --yes
```

If it refuses because the directory is not empty, scaffold into a temp dir and copy in:

```bash
npx create-next-app@latest /tmp/rk --typescript --tailwind --app --no-src-dir --import-alias "@/*" --yes
cp -R /tmp/rk/. ~/Desktop/code-folders/rookery/ && rm -rf /tmp/rk
```

- [ ] **Step 2: Install dependencies**

```bash
npm i zustand lucide-react @prisma/client @supabase/supabase-js clsx tailwind-merge
npm i -D vitest @vitejs/plugin-react jsdom prisma
```

- [ ] **Step 3: Add Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', globals: true },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
})
```

Add to `package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 4: Theme tokens**

Replace `app/globals.css` with the Corvinus palette pulled from their live site:

```css
@import "tailwindcss";

@theme {
  --color-bg:        #0A0A0B;
  --color-panel:     #080d14;
  --color-deep:      #050505;
  --color-primary:   #006495;
  --color-accent:    #14B8A6;
  --color-surface:   rgba(255,255,255,0.05);
  --color-line:      rgba(255,255,255,0.10);
  --color-text:      #F3F4F6;
  --color-muted:     #6B7280;
  --font-display:    Lora, Georgia, serif;
  --font-mono:       "JetBrains Mono", ui-monospace, monospace;
}

html, body {
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-mono);
}

/* Corvinus signature: faint grid overlay */
.grid-overlay {
  background-image:
    linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px),
    linear-gradient(0deg,  rgba(255,255,255,0.04) 1px, transparent 1px);
  background-size: 48px 48px;
}

.eyebrow {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 2.5px;
  text-transform: uppercase;
  color: var(--color-muted);
}
```

- [ ] **Step 5: Load fonts in `app/layout.tsx`**

```tsx
import { Lora, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const lora = Lora({ subsets: ['latin'], weight: ['500','700'], variable: '--font-lora' })
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400','700'], variable: '--font-jb' })

export const metadata = { title: 'Rookery', description: 'Lab image annotation for robot perception' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${lora.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 6: Verify**

Run: `npm run dev` and open http://localhost:3000
Expected: dark `#0A0A0B` page, no console errors.

- [ ] **Step 7: Commit**

```bash
cd ~/Desktop/code-folders/rookery && git add -A && git commit -m "Scaffold Next.js app with Corvinus theme tokens"
```

---

## Task 2: Shared types

**Files:**
- Create: `lib/canvas/types.ts`

- [ ] **Step 1: Define the types every later task depends on**

```ts
export type Point = { x: number; y: number }
export type BBox = [x: number, y: number, w: number, h: number]

export type AttrType = 'NUMBER' | 'PERCENT' | 'ENUM' | 'BOOLEAN' | 'TEXT'

export interface AttributeDef {
  key: string
  name: string
  type: AttrType
  options?: string[]
  defaultValue?: string | number | boolean
}

export interface LabelClass {
  id: string
  key: string
  name: string
  color: string
  attributes: AttributeDef[]
}

export type Geometry =
  | { kind: 'box'; x: number; y: number; w: number; h: number }
  | { kind: 'polygon'; points: Float32Array }
  | { kind: 'mask'; rle: number[]; width: number; height: number }

export interface Annotation {
  id: string
  imageId: string
  classId: string
  geometry: Geometry
  bbox: BBox
  attributes: Record<string, string | number | boolean>
}

export interface ImageAsset {
  id: string
  filename: string
  source: 'BUNDLED' | 'UPLOADED'
  url: string
  width: number
  height: number
}

export interface Viewport { scale: number; tx: number; ty: number }

export type ToolId = 'select' | 'box' | 'polygon' | 'brush' | 'erase'
```

- [ ] **Step 2: Commit**

```bash
cd ~/Desktop/code-folders/rookery && git add -A && git commit -m "Add shared annotation and geometry types"
```

---

## Task 3: Geometry primitives (TDD)

**Files:**
- Create: `lib/canvas/geometry.ts`
- Test: `lib/canvas/geometry.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { bboxFromPoints, bboxFromBox, pointInPolygon, distToSegment } from './geometry'

describe('bboxFromPoints', () => {
  it('returns x, y, w, h covering all points', () => {
    const pts = new Float32Array([10, 20, 50, 20, 50, 80, 10, 80])
    expect(bboxFromPoints(pts)).toEqual([10, 20, 40, 60])
  })

  it('handles a single point as a zero-size box', () => {
    expect(bboxFromPoints(new Float32Array([5, 7]))).toEqual([5, 7, 0, 0])
  })
})

describe('bboxFromBox', () => {
  it('normalizes negative width and height', () => {
    expect(bboxFromBox(50, 80, -40, -60)).toEqual([10, 20, 40, 60])
  })
})

describe('pointInPolygon', () => {
  const square = new Float32Array([0, 0, 100, 0, 100, 100, 0, 100])

  it('returns true for an interior point', () => {
    expect(pointInPolygon(50, 50, square)).toBe(true)
  })

  it('returns false for an exterior point', () => {
    expect(pointInPolygon(150, 50, square)).toBe(false)
  })

  it('handles a concave polygon', () => {
    // an L shape
    const L = new Float32Array([0,0, 100,0, 100,40, 40,40, 40,100, 0,100])
    expect(pointInPolygon(70, 70, L)).toBe(false)
    expect(pointInPolygon(20, 70, L)).toBe(true)
  })
})

describe('distToSegment', () => {
  it('returns perpendicular distance when the foot is on the segment', () => {
    expect(distToSegment(50, 30, 0, 0, 100, 0)).toBeCloseTo(30)
  })

  it('returns endpoint distance when the foot is past the segment', () => {
    expect(distToSegment(-30, 0, 0, 0, 100, 0)).toBeCloseTo(30)
  })

  it('handles a zero-length segment', () => {
    expect(distToSegment(3, 4, 0, 0, 0, 0)).toBeCloseTo(5)
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run lib/canvas/geometry.test.ts`
Expected: FAIL, cannot resolve `./geometry`.

- [ ] **Step 3: Implement**

```ts
import type { BBox } from './types'

export function bboxFromPoints(pts: Float32Array): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i], y = pts[i + 1]
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return [minX, minY, maxX - minX, maxY - minY]
}

export function bboxFromBox(x: number, y: number, w: number, h: number): BBox {
  return [w < 0 ? x + w : x, h < 0 ? y + h : y, Math.abs(w), Math.abs(h)]
}

export function pointInPolygon(px: number, py: number, pts: Float32Array): boolean {
  let inside = false
  const n = pts.length / 2
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i * 2], yi = pts[i * 2 + 1]
    const xj = pts[j * 2], yj = pts[j * 2 + 1]
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

export function distToSegment(
  px: number, py: number, ax: number, ay: number, bx: number, by: number,
): number {
  const dx = bx - ax, dy = by - ay
  const lenSq = dx * dx + dy * dy
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * dx, cy = ay + t * dy
  return Math.hypot(px - cx, py - cy)
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `npx vitest run lib/canvas/geometry.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/code-folders/rookery && git add -A && git commit -m "Add geometry primitives with tests"
```

---

## Task 4: Viewport transform (TDD)

**Files:**
- Create: `lib/canvas/transform.ts`
- Test: `lib/canvas/transform.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { screenToImage, imageToScreen, zoomAt, fitToContainer } from './transform'

const v = { scale: 2, tx: 100, ty: 50 }

describe('coordinate conversion', () => {
  it('converts screen to image', () => {
    expect(screenToImage(v, 300, 250)).toEqual({ x: 100, y: 100 })
  })

  it('round-trips back to the same screen point', () => {
    const img = screenToImage(v, 300, 250)
    expect(imageToScreen(v, img.x, img.y)).toEqual({ x: 300, y: 250 })
  })
})

describe('zoomAt', () => {
  it('keeps the anchor point pinned under the cursor', () => {
    const before = screenToImage(v, 300, 250)
    const next = zoomAt(v, 300, 250, 1.5, 0.1, 20)
    const after = screenToImage(next, 300, 250)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('clamps to the maximum scale', () => {
    expect(zoomAt(v, 0, 0, 100, 0.1, 8).scale).toBe(8)
  })

  it('clamps to the minimum scale', () => {
    expect(zoomAt(v, 0, 0, 0.001, 0.25, 8).scale).toBe(0.25)
  })
})

describe('fitToContainer', () => {
  it('scales to fit and centers on the constrained axis', () => {
    const r = fitToContainer(1000, 500, 400, 400)
    expect(r.scale).toBeCloseTo(0.4)
    expect(r.tx).toBeCloseTo(0)
    expect(r.ty).toBeCloseTo(100)
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run lib/canvas/transform.test.ts`
Expected: FAIL, cannot resolve `./transform`.

- [ ] **Step 3: Implement**

```ts
import type { Point, Viewport } from './types'

export function screenToImage(v: Viewport, sx: number, sy: number): Point {
  return { x: (sx - v.tx) / v.scale, y: (sy - v.ty) / v.scale }
}

export function imageToScreen(v: Viewport, ix: number, iy: number): Point {
  return { x: ix * v.scale + v.tx, y: iy * v.scale + v.ty }
}

export function zoomAt(
  v: Viewport, sx: number, sy: number, factor: number, min: number, max: number,
): Viewport {
  const scale = Math.max(min, Math.min(max, v.scale * factor))
  // solve so the image point under (sx, sy) does not move
  const img = screenToImage(v, sx, sy)
  return { scale, tx: sx - img.x * scale, ty: sy - img.y * scale }
}

export function fitToContainer(
  imgW: number, imgH: number, cw: number, ch: number,
): Viewport {
  const scale = Math.min(cw / imgW, ch / imgH)
  return {
    scale,
    tx: (cw - imgW * scale) / 2,
    ty: (ch - imgH * scale) / 2,
  }
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `npx vitest run lib/canvas/transform.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/code-folders/rookery && git add -A && git commit -m "Add viewport transform with cursor-anchored zoom"
```

---

## Task 5: Path simplification (TDD)

**Files:**
- Create: `lib/canvas/simplify.ts`
- Test: `lib/canvas/simplify.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { simplify } from './simplify'

describe('simplify', () => {
  it('collapses collinear points to the two endpoints', () => {
    const pts = new Float32Array([0,0, 10,0, 20,0, 30,0, 40,0])
    expect(Array.from(simplify(pts, 1))).toEqual([0,0, 40,0])
  })

  it('keeps a point that deviates beyond tolerance', () => {
    const pts = new Float32Array([0,0, 10,5, 20,0])
    expect(Array.from(simplify(pts, 1))).toEqual([0,0, 10,5, 20,0])
  })

  it('drops a point that deviates within tolerance', () => {
    const pts = new Float32Array([0,0, 10,0.5, 20,0])
    expect(Array.from(simplify(pts, 1))).toEqual([0,0, 20,0])
  })

  it('returns input unchanged when there are fewer than three points', () => {
    const pts = new Float32Array([1,2, 3,4])
    expect(Array.from(simplify(pts, 1))).toEqual([1,2, 3,4])
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run lib/canvas/simplify.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement Ramer-Douglas-Peucker**

```ts
import { distToSegment } from './geometry'

export function simplify(pts: Float32Array, tolerance: number): Float32Array {
  const n = pts.length / 2
  if (n < 3) return pts

  const keep = new Uint8Array(n)
  keep[0] = 1
  keep[n - 1] = 1

  const stack: [number, number][] = [[0, n - 1]]
  while (stack.length) {
    const [first, last] = stack.pop()!
    let maxDist = 0
    let index = -1
    for (let i = first + 1; i < last; i++) {
      const d = distToSegment(
        pts[i * 2], pts[i * 2 + 1],
        pts[first * 2], pts[first * 2 + 1],
        pts[last * 2], pts[last * 2 + 1],
      )
      if (d > maxDist) { maxDist = d; index = i }
    }
    if (maxDist > tolerance && index !== -1) {
      keep[index] = 1
      stack.push([first, index], [index, last])
    }
  }

  const out: number[] = []
  for (let i = 0; i < n; i++) {
    if (keep[i]) out.push(pts[i * 2], pts[i * 2 + 1])
  }
  return new Float32Array(out)
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `npx vitest run lib/canvas/simplify.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/code-folders/rookery && git add -A && git commit -m "Add Ramer-Douglas-Peucker path simplification"
```

---

## Task 6: Mask run-length encoding (TDD)

**Files:**
- Create: `lib/canvas/rle.ts`
- Test: `lib/canvas/rle.test.ts`

Format: alternating run lengths, always starting with a run of zeros. Row-major. A leading
run of length 0 is emitted when the mask starts with a filled pixel. This mirrors the COCO
convention closely enough to be recognizable while staying readable in the export.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { encodeRLE, decodeRLE } from './rle'

describe('encodeRLE', () => {
  it('encodes leading zeros then a run of ones', () => {
    expect(encodeRLE(new Uint8Array([0,0,0,1,1,0,0,0,0]))).toEqual([3,2,4])
  })

  it('emits a leading zero-length run when the mask starts filled', () => {
    expect(encodeRLE(new Uint8Array([1,1,0]))).toEqual([0,2,1])
  })

  it('encodes an all-empty mask', () => {
    expect(encodeRLE(new Uint8Array([0,0,0]))).toEqual([3])
  })

  it('treats any nonzero value as filled', () => {
    expect(encodeRLE(new Uint8Array([0,255,255,0]))).toEqual([1,2,1])
  })
})

describe('decodeRLE', () => {
  it('round-trips an arbitrary mask', () => {
    const mask = new Uint8Array([0,0,1,1,1,0,1,0,0,0,1])
    expect(Array.from(decodeRLE(encodeRLE(mask), mask.length)))
      .toEqual(Array.from(mask))
  })

  it('pads with zeros when runs are shorter than the requested length', () => {
    expect(Array.from(decodeRLE([1,1], 5))).toEqual([0,1,0,0,0])
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run lib/canvas/rle.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
export function encodeRLE(mask: Uint8Array): number[] {
  const runs: number[] = []
  let current = 0        // 0 = empty run, 1 = filled run
  let count = 0

  for (let i = 0; i < mask.length; i++) {
    const v = mask[i] ? 1 : 0
    if (v === current) {
      count++
    } else {
      runs.push(count)
      current = v
      count = 1
    }
  }
  if (count > 0) runs.push(count)
  return runs
}

export function decodeRLE(runs: number[], length: number): Uint8Array {
  const out = new Uint8Array(length)
  let pos = 0
  let value = 0
  for (const run of runs) {
    const end = Math.min(pos + run, length)
    if (value === 1) out.fill(1, pos, end)
    pos = end
    value = value === 0 ? 1 : 0
    if (pos >= length) break
  }
  return out
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `npx vitest run lib/canvas/rle.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/code-folders/rookery && git add -A && git commit -m "Add run-length encoding for mask export"
```

---

## Task 7: Mask buffer with snapshot ring (TDD)

This is the centerpiece of the state-handling deliverable. Read spec section 6.4 before
starting.

**Files:**
- Create: `lib/canvas/mask-buffer.ts`
- Test: `lib/canvas/mask-buffer.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { MaskBuffer, type Stroke } from './mask-buffer'

function stroke(x: number, y: number, mode: 'paint' | 'erase' = 'paint'): Stroke {
  return { points: new Float32Array([x, y]), radius: 1, mode }
}

describe('MaskBuffer', () => {
  it('starts empty', () => {
    const b = new MaskBuffer(10, 10)
    expect(b.data.every(v => v === 0)).toBe(true)
    expect(b.strokeCount).toBe(0)
  })

  it('paints a stroke into the bitmap', () => {
    const b = new MaskBuffer(10, 10)
    b.apply(stroke(5, 5))
    expect(b.data[5 * 10 + 5]).toBe(1)
    expect(b.strokeCount).toBe(1)
  })

  it('erases previously painted pixels', () => {
    const b = new MaskBuffer(10, 10)
    b.apply(stroke(5, 5))
    b.apply(stroke(5, 5, 'erase'))
    expect(b.data[5 * 10 + 5]).toBe(0)
  })

  it('restores exact prior pixels on undo', () => {
    const b = new MaskBuffer(10, 10)
    b.apply(stroke(2, 2))
    const before = Array.from(b.data)
    b.apply(stroke(7, 7))
    b.undo()
    expect(Array.from(b.data)).toEqual(before)
    expect(b.strokeCount).toBe(1)
  })

  it('undo is a no-op on an empty buffer', () => {
    const b = new MaskBuffer(10, 10)
    expect(() => b.undo()).not.toThrow()
    expect(b.strokeCount).toBe(0)
  })

  it('takes a snapshot every SNAPSHOT_INTERVAL strokes', () => {
    const b = new MaskBuffer(10, 10)
    for (let i = 0; i < 45; i++) b.apply(stroke(i % 10, 0))
    // snapshots expected at stroke counts 20 and 40
    expect(b.snapshotIndices).toEqual([20, 40])
  })

  it('bounds replay cost to at most SNAPSHOT_INTERVAL strokes', () => {
    const b = new MaskBuffer(10, 10)
    for (let i = 0; i < 100; i++) b.apply(stroke(i % 10, 0))
    b.undo()
    expect(b.lastReplayCount).toBeLessThanOrEqual(MaskBuffer.SNAPSHOT_INTERVAL)
  })

  it('keeps at most MAX_SNAPSHOTS snapshots', () => {
    const b = new MaskBuffer(10, 10)
    for (let i = 0; i < 400; i++) b.apply(stroke(i % 10, 0))
    expect(b.snapshotIndices.length).toBeLessThanOrEqual(MaskBuffer.MAX_SNAPSHOTS)
  })

  it('undo still reproduces correct pixels after snapshots are evicted', () => {
    const b = new MaskBuffer(10, 10)
    for (let i = 0; i < 300; i++) b.apply(stroke(i % 10, i % 10))
    const before = Array.from(b.data)
    b.apply(stroke(9, 0))
    b.undo()
    expect(Array.from(b.data)).toEqual(before)
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run lib/canvas/mask-buffer.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
export interface Stroke {
  points: Float32Array      // flat [x,y,x,y,...] in image space
  radius: number
  mode: 'paint' | 'erase'
}

interface Snapshot { index: number; data: Uint8Array }

/**
 * Holds the rasterized mask plus the stroke history that produced it.
 *
 * Painting is destructive, so undo cannot subtract a stroke. It rebuilds from
 * the nearest snapshot instead. Snapshots every SNAPSHOT_INTERVAL strokes make
 * undo constant time rather than growing with session length. See spec 6.4.
 */
export class MaskBuffer {
  static readonly SNAPSHOT_INTERVAL = 20
  static readonly MAX_SNAPSHOTS = 5

  readonly width: number
  readonly height: number
  data: Uint8Array

  private strokes: Stroke[] = []
  private snapshots: Snapshot[] = []

  /** Exposed for tests and for the perf note in the architecture doc. */
  lastReplayCount = 0

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.data = new Uint8Array(width * height)
  }

  get strokeCount() { return this.strokes.length }
  get snapshotIndices() { return this.snapshots.map(s => s.index) }

  apply(s: Stroke) {
    this.strokes.push(s)
    this.rasterize(s)
    if (this.strokes.length % MaskBuffer.SNAPSHOT_INTERVAL === 0) {
      this.snapshots.push({ index: this.strokes.length, data: this.data.slice() })
      if (this.snapshots.length > MaskBuffer.MAX_SNAPSHOTS) this.snapshots.shift()
    }
  }

  undo() {
    if (this.strokes.length === 0) { this.lastReplayCount = 0; return }
    this.strokes.pop()
    this.rebuild()
  }

  /** Replace the whole history, used when loading from the server. */
  reset(strokes: Stroke[]) {
    this.strokes = strokes.slice()
    this.snapshots = []
    this.rebuild()
  }

  private rebuild() {
    const target = this.strokes.length

    // drop snapshots taken after the current head
    while (this.snapshots.length && this.snapshots[this.snapshots.length - 1].index > target) {
      this.snapshots.pop()
    }

    const snap = this.snapshots[this.snapshots.length - 1]
    let from: number
    if (snap) {
      this.data = snap.data.slice()
      from = snap.index
    } else {
      this.data = new Uint8Array(this.width * this.height)
      from = 0
    }

    for (let i = from; i < target; i++) this.rasterize(this.strokes[i])
    this.lastReplayCount = target - from
  }

  private rasterize(s: Stroke) {
    const value = s.mode === 'paint' ? 1 : 0
    const n = s.points.length / 2
    if (n === 1) {
      this.stamp(s.points[0], s.points[1], s.radius, value)
      return
    }
    // interpolate between samples so fast drags leave no gaps
    for (let i = 1; i < n; i++) {
      const x0 = s.points[(i - 1) * 2], y0 = s.points[(i - 1) * 2 + 1]
      const x1 = s.points[i * 2],       y1 = s.points[i * 2 + 1]
      const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)))
      for (let t = 0; t <= steps; t++) {
        const f = t / steps
        this.stamp(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, s.radius, value)
      }
    }
  }

  private stamp(cx: number, cy: number, r: number, value: number) {
    const x0 = Math.max(0, Math.floor(cx - r))
    const x1 = Math.min(this.width - 1, Math.ceil(cx + r))
    const y0 = Math.max(0, Math.floor(cy - r))
    const y1 = Math.min(this.height - 1, Math.ceil(cy + r))
    const rSq = r * r
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx
        if (dx * dx + dy * dy <= rSq) this.data[y * this.width + x] = value
      }
    }
  }
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `npx vitest run lib/canvas/mask-buffer.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/code-folders/rookery && git add -A && git commit -m "Add mask buffer with snapshot-bounded undo replay"
```

---

## Task 8: Command stack (TDD)

**Files:**
- Create: `lib/state/commands.ts`
- Test: `lib/state/commands.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { CommandStack, type Command } from './commands'

function counterCommand(log: string[], name: string): Command {
  return {
    label: name,
    do:   () => { log.push(`do:${name}`) },
    undo: () => { log.push(`undo:${name}`) },
  }
}

describe('CommandStack', () => {
  it('runs a command when executed', () => {
    const log: string[] = []
    const s = new CommandStack()
    s.execute(counterCommand(log, 'a'))
    expect(log).toEqual(['do:a'])
  })

  it('undoes in reverse order', () => {
    const log: string[] = []
    const s = new CommandStack()
    s.execute(counterCommand(log, 'a'))
    s.execute(counterCommand(log, 'b'))
    s.undo(); s.undo()
    expect(log).toEqual(['do:a', 'do:b', 'undo:b', 'undo:a'])
  })

  it('redoes what was undone', () => {
    const log: string[] = []
    const s = new CommandStack()
    s.execute(counterCommand(log, 'a'))
    s.undo()
    s.redo()
    expect(log).toEqual(['do:a', 'undo:a', 'do:a'])
  })

  it('clears the redo stack when a new command is executed', () => {
    const s = new CommandStack()
    s.execute(counterCommand([], 'a'))
    s.undo()
    expect(s.canRedo).toBe(true)
    s.execute(counterCommand([], 'b'))
    expect(s.canRedo).toBe(false)
  })

  it('reports canUndo and canRedo correctly', () => {
    const s = new CommandStack()
    expect(s.canUndo).toBe(false)
    expect(s.canRedo).toBe(false)
    s.execute(counterCommand([], 'a'))
    expect(s.canUndo).toBe(true)
    s.undo()
    expect(s.canUndo).toBe(false)
    expect(s.canRedo).toBe(true)
  })

  it('ignores undo and redo when the stacks are empty', () => {
    const s = new CommandStack()
    expect(() => { s.undo(); s.redo() }).not.toThrow()
  })

  it('caps history at the configured limit', () => {
    const s = new CommandStack(3)
    for (let i = 0; i < 10; i++) s.execute(counterCommand([], `c${i}`))
    expect(s.undoLabels).toEqual(['c7', 'c8', 'c9'])
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run lib/state/commands.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
export interface Command {
  label: string
  do(): void
  undo(): void
}

/**
 * Undo stores the action, not the resulting state.
 *
 * Deep-copying state per edit is fine for vector shapes but fails for masks,
 * where one full-HD frame is megabytes. A command carries only what it needs to
 * invert itself. See spec 6.3.
 */
export class CommandStack {
  private undoStack: Command[] = []
  private redoStack: Command[] = []

  constructor(private limit = 200) {}

  get canUndo() { return this.undoStack.length > 0 }
  get canRedo() { return this.redoStack.length > 0 }
  get undoLabels() { return this.undoStack.map(c => c.label) }

  execute(c: Command) {
    c.do()
    this.undoStack.push(c)
    if (this.undoStack.length > this.limit) this.undoStack.shift()
    this.redoStack.length = 0
  }

  undo() {
    const c = this.undoStack.pop()
    if (!c) return
    c.undo()
    this.redoStack.push(c)
  }

  redo() {
    const c = this.redoStack.pop()
    if (!c) return
    c.do()
    this.undoStack.push(c)
  }

  clear() {
    this.undoStack.length = 0
    this.redoStack.length = 0
  }
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `npx vitest run lib/state/commands.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/code-folders/rookery && git add -A && git commit -m "Add command stack for undo and redo"
```

---

## Task 9: Hit testing with a spatial grid (TDD)

**Files:**
- Create: `lib/canvas/hit-test.ts`
- Test: `lib/canvas/hit-test.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { SpatialIndex } from './hit-test'
import type { Annotation } from './types'

function boxAnn(id: string, x: number, y: number, w: number, h: number): Annotation {
  return {
    id, imageId: 'i1', classId: 'c1',
    geometry: { kind: 'box', x, y, w, h },
    bbox: [x, y, w, h],
    attributes: {},
  }
}

describe('SpatialIndex', () => {
  it('finds the annotation under a point', () => {
    const idx = new SpatialIndex(1000, 1000)
    idx.rebuild([boxAnn('a', 10, 10, 50, 50)])
    expect(idx.hitTest(20, 20)?.id).toBe('a')
  })

  it('returns null when nothing is under the point', () => {
    const idx = new SpatialIndex(1000, 1000)
    idx.rebuild([boxAnn('a', 10, 10, 50, 50)])
    expect(idx.hitTest(500, 500)).toBeNull()
  })

  it('returns the last added annotation when shapes overlap', () => {
    const idx = new SpatialIndex(1000, 1000)
    idx.rebuild([boxAnn('under', 0, 0, 100, 100), boxAnn('over', 0, 0, 100, 100)])
    expect(idx.hitTest(50, 50)?.id).toBe('over')
  })

  it('respects polygon shape, not just its bounding box', () => {
    const idx = new SpatialIndex(1000, 1000)
    const tri: Annotation = {
      id: 't', imageId: 'i1', classId: 'c1',
      geometry: { kind: 'polygon', points: new Float32Array([0,0, 100,0, 0,100]) },
      bbox: [0, 0, 100, 100],
      attributes: {},
    }
    idx.rebuild([tri])
    expect(idx.hitTest(10, 10)?.id).toBe('t')   // inside the triangle
    expect(idx.hitTest(90, 90)).toBeNull()      // in the bbox, outside the triangle
  })

  it('only tests candidates in nearby cells', () => {
    const idx = new SpatialIndex(1000, 1000)
    const many = Array.from({ length: 200 }, (_, i) => boxAnn(`a${i}`, i * 4, 0, 3, 3))
    idx.rebuild(many)
    idx.hitTest(500, 500)
    expect(idx.lastCandidateCount).toBeLessThan(many.length)
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run lib/canvas/hit-test.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import type { Annotation } from './types'
import { pointInPolygon } from './geometry'
import { decodeRLE } from './rle'

const CELL = 128

/**
 * Uniform grid over image space. Hit testing checks only the cell under the
 * cursor instead of every annotation, so click cost stays flat as the image
 * fills up. See spec 5.4.
 */
export class SpatialIndex {
  private cells = new Map<number, Annotation[]>()
  private cols: number
  lastCandidateCount = 0

  constructor(private width: number, private height: number) {
    this.cols = Math.ceil(width / CELL)
  }

  private key(cx: number, cy: number) { return cy * this.cols + cx }

  rebuild(annotations: Annotation[]) {
    this.cells.clear()
    for (const a of annotations) {
      const [x, y, w, h] = a.bbox
      const cx0 = Math.max(0, Math.floor(x / CELL))
      const cy0 = Math.max(0, Math.floor(y / CELL))
      const cx1 = Math.min(this.cols - 1, Math.floor((x + w) / CELL))
      const cy1 = Math.floor((y + h) / CELL)
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const k = this.key(cx, cy)
          const list = this.cells.get(k)
          if (list) list.push(a); else this.cells.set(k, [a])
        }
      }
    }
  }

  hitTest(x: number, y: number): Annotation | null {
    const candidates = this.cells.get(
      this.key(Math.floor(x / CELL), Math.floor(y / CELL)),
    ) ?? []
    this.lastCandidateCount = candidates.length

    // iterate backwards so the most recently added shape wins overlaps
    for (let i = candidates.length - 1; i >= 0; i--) {
      if (this.contains(candidates[i], x, y)) return candidates[i]
    }
    return null
  }

  private contains(a: Annotation, x: number, y: number): boolean {
    const g = a.geometry
    if (g.kind === 'box') {
      return x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h
    }
    if (g.kind === 'polygon') {
      return pointInPolygon(x, y, g.points)
    }
    const px = Math.floor(x), py = Math.floor(y)
    if (px < 0 || py < 0 || px >= g.width || py >= g.height) return false
    return decodeRLE(g.rle, g.width * g.height)[py * g.width + px] === 1
  }
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `npx vitest run lib/canvas/hit-test.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/code-folders/rookery && git add -A && git commit -m "Add spatial-grid hit testing"
```

---

## Task 10: Export builder (TDD)

Building this early keeps the export format honest, because every later feature has to fit
a shape that is already tested.

**Files:**
- Create: `lib/export/build-export.ts`
- Test: `lib/export/build-export.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { buildExport } from './build-export'
import type { Annotation, ImageAsset, LabelClass } from '@/lib/canvas/types'

const cls: LabelClass = {
  id: 'c1', key: 'reagent_bottle', name: 'Reagent Bottle', color: '#14B8A6',
  attributes: [
    { key: 'liquid_level', name: 'Liquid Level', type: 'PERCENT' },
    { key: 'state', name: 'State', type: 'ENUM', options: ['Open', 'Closed'] },
  ],
}

const img: ImageAsset = {
  id: 'i1', filename: 'bench_01.jpg', source: 'BUNDLED',
  url: '/samples/bench_01.jpg', width: 1920, height: 1080,
}

const poly: Annotation = {
  id: 'a1', imageId: 'i1', classId: 'c1',
  geometry: { kind: 'polygon', points: new Float32Array([412,220, 498,220, 501,390, 409,388]) },
  bbox: [409, 220, 92, 170],
  attributes: { 'Liquid Level': 50, State: 'Open' },
}

describe('buildExport', () => {
  it('includes schema version and project name', () => {
    const out = buildExport({ project: { id: 'p1', name: 'Bench Set A' }, classes: [cls], images: [img], annotations: [poly] })
    expect(out.schema_version).toBe('1.0')
    expect(out.project.name).toBe('Bench Set A')
  })

  it('emits class definitions with their attribute schemas', () => {
    const out = buildExport({ project: { id: 'p1', name: 'x' }, classes: [cls], images: [img], annotations: [] })
    expect(out.classes[0].id).toBe('reagent_bottle')
    expect(out.classes[0].attributes).toEqual([
      { name: 'Liquid Level', type: 'percent' },
      { name: 'State', type: 'enum', options: ['Open', 'Closed'] },
    ])
  })

  it('nests annotations under their image', () => {
    const out = buildExport({ project: { id: 'p1', name: 'x' }, classes: [cls], images: [img], annotations: [poly] })
    expect(out.images[0].annotations).toHaveLength(1)
    expect(out.images[0].annotations[0].class).toBe('reagent_bottle')
  })

  it('serializes polygon points as nested number pairs', () => {
    const out = buildExport({ project: { id: 'p1', name: 'x' }, classes: [cls], images: [img], annotations: [poly] })
    expect(out.images[0].annotations[0].geometry).toEqual({
      points: [[412,220],[498,220],[501,390],[409,388]],
    })
  })

  it('always emits a bbox', () => {
    const out = buildExport({ project: { id: 'p1', name: 'x' }, classes: [cls], images: [img], annotations: [poly] })
    expect(out.images[0].annotations[0].bbox).toEqual([409, 220, 92, 170])
  })

  it('emits an empty annotations array for an untouched image', () => {
    const out = buildExport({ project: { id: 'p1', name: 'x' }, classes: [cls], images: [img], annotations: [] })
    expect(out.images[0].annotations).toEqual([])
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run lib/export/build-export.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import type { Annotation, ImageAsset, LabelClass } from '@/lib/canvas/types'

export interface ExportInput {
  project: { id: string; name: string }
  classes: LabelClass[]
  images: ImageAsset[]
  annotations: Annotation[]
}

export function buildExport(input: ExportInput) {
  const classKeyById = new Map(input.classes.map(c => [c.id, c.key]))
  const byImage = new Map<string, Annotation[]>()
  for (const a of input.annotations) {
    const list = byImage.get(a.imageId)
    if (list) list.push(a); else byImage.set(a.imageId, [a])
  }

  return {
    schema_version: '1.0',
    exported_at: new Date().toISOString(),
    project: input.project,
    classes: input.classes.map(c => ({
      id: c.key,
      name: c.name,
      color: c.color,
      attributes: c.attributes.map(a => {
        const base: Record<string, unknown> = { name: a.name, type: a.type.toLowerCase() }
        if (a.options) base.options = a.options
        return base
      }),
    })),
    images: input.images.map(img => ({
      id: img.id,
      file: img.filename,
      width: img.width,
      height: img.height,
      annotations: (byImage.get(img.id) ?? []).map(a => ({
        id: a.id,
        class: classKeyById.get(a.classId) ?? a.classId,
        type: a.geometry.kind,
        geometry: serializeGeometry(a.geometry),
        bbox: a.bbox,
        attributes: a.attributes,
      })),
    })),
  }
}

function serializeGeometry(g: Annotation['geometry']) {
  if (g.kind === 'box') return { x: g.x, y: g.y, w: g.w, h: g.h }
  if (g.kind === 'mask') return { rle: g.rle, width: g.width, height: g.height }
  const points: number[][] = []
  for (let i = 0; i < g.points.length; i += 2) points.push([g.points[i], g.points[i + 1]])
  return { points }
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `npx vitest run lib/export/build-export.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/code-folders/rookery && git add -A && git commit -m "Add export builder with tested JSON schema"
```

---

## Task 11: Zustand store

**Files:**
- Create: `lib/state/store.ts`

- [ ] **Step 1: Implement the normalized store**

```ts
import { create } from 'zustand'
import type { Annotation, ImageAsset, LabelClass, ToolId, Viewport } from '@/lib/canvas/types'
import { CommandStack } from './commands'

interface State {
  images: Record<string, ImageAsset>
  imageIds: string[]
  activeImageId: string | null

  annotations: Record<string, Annotation>
  annotationIds: string[]
  selectedId: string | null

  classes: Record<string, LabelClass>
  classIds: string[]
  activeClassId: string | null

  tool: ToolId
  viewport: Viewport
  brushSize: number
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'

  addAnnotation(a: Annotation): void
  removeAnnotation(id: string): void
  updateAnnotation(id: string, patch: Partial<Annotation>): void
  setSelected(id: string | null): void
  setTool(t: ToolId): void
  setViewport(v: Viewport): void
  setActiveImage(id: string): void
  setActiveClass(id: string): void
  setBrushSize(n: number): void
  addClass(c: LabelClass): void
  hydrate(payload: {
    images: ImageAsset[]; classes: LabelClass[]; annotations: Annotation[]
  }): void
}

export const commandStack = new CommandStack()

export const useStore = create<State>((set) => ({
  images: {}, imageIds: [], activeImageId: null,
  annotations: {}, annotationIds: [], selectedId: null,
  classes: {}, classIds: [], activeClassId: null,
  tool: 'select',
  viewport: { scale: 1, tx: 0, ty: 0 },
  brushSize: 12,
  saveStatus: 'idle',

  addAnnotation: (a) => set(s => ({
    annotations: { ...s.annotations, [a.id]: a },
    annotationIds: [...s.annotationIds, a.id],
    selectedId: a.id,
  })),

  removeAnnotation: (id) => set(s => {
    const { [id]: _drop, ...rest } = s.annotations
    return {
      annotations: rest,
      annotationIds: s.annotationIds.filter(x => x !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    }
  }),

  updateAnnotation: (id, patch) => set(s => ({
    annotations: { ...s.annotations, [id]: { ...s.annotations[id], ...patch } },
  })),

  setSelected:    (id) => set({ selectedId: id }),
  setTool:        (t)  => set({ tool: t }),
  setViewport:    (v)  => set({ viewport: v }),
  setActiveImage: (id) => set({ activeImageId: id, selectedId: null }),
  setActiveClass: (id) => set({ activeClassId: id }),
  setBrushSize:   (n)  => set({ brushSize: Math.max(1, Math.min(200, n)) }),

  addClass: (c) => set(s => ({
    classes: { ...s.classes, [c.id]: c },
    classIds: [...s.classIds, c.id],
    activeClassId: s.activeClassId ?? c.id,
  })),

  hydrate: ({ images, classes, annotations }) => set({
    images: Object.fromEntries(images.map(i => [i.id, i])),
    imageIds: images.map(i => i.id),
    activeImageId: images[0]?.id ?? null,
    classes: Object.fromEntries(classes.map(c => [c.id, c])),
    classIds: classes.map(c => c.id),
    activeClassId: classes[0]?.id ?? null,
    annotations: Object.fromEntries(annotations.map(a => [a.id, a])),
    annotationIds: annotations.map(a => a.id),
  }),
}))
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd ~/Desktop/code-folders/rookery && git add -A && git commit -m "Add normalized Zustand store"
```

---

## Task 12: Layered canvas stage and render loop

This is the centerpiece of the canvas deliverable. Read spec section 5 before starting.

**Files:**
- Create: `lib/canvas/renderer.ts`
- Create: `components/canvas/CanvasStage.tsx`

- [ ] **Step 1: Implement the renderer**

```ts
export type LayerName = 'image' | 'mask' | 'vector' | 'interaction'

export interface LayerContexts {
  image: CanvasRenderingContext2D
  mask: CanvasRenderingContext2D
  vector: CanvasRenderingContext2D
  interaction: CanvasRenderingContext2D
}

/**
 * Dirty-flag renderer.
 *
 * Layers are split by lifetime, not by tool. A layer that did not change is not
 * repainted, so dragging a polygon rubber band never touches the photo or the
 * finished shapes. All repaints are coalesced into one rAF callback rather than
 * firing per pointer event. See spec 5.2 and 5.3.
 */
export class Renderer {
  private dirty = new Set<LayerName>()
  private frame: number | null = null
  private draws = new Map<LayerName, (ctx: CanvasRenderingContext2D) => void>()

  constructor(private ctxs: LayerContexts) {}

  setDraw(layer: LayerName, fn: (ctx: CanvasRenderingContext2D) => void) {
    this.draws.set(layer, fn)
  }

  invalidate(...layers: LayerName[]) {
    for (const l of layers) this.dirty.add(l)
    this.schedule()
  }

  private schedule() {
    if (this.frame !== null) return
    this.frame = requestAnimationFrame(() => {
      this.frame = null
      for (const layer of this.dirty) {
        const draw = this.draws.get(layer)
        if (!draw) continue
        const ctx = this.ctxs[layer]
        ctx.save()
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
        ctx.restore()
        draw(ctx)
      }
      this.dirty.clear()
    })
  }

  destroy() {
    if (this.frame !== null) cancelAnimationFrame(this.frame)
    this.frame = null
    this.dirty.clear()
    this.draws.clear()
  }
}

/** Size a canvas for the device pixel ratio so strokes are not blurry. */
export function sizeCanvas(canvas: HTMLCanvasElement, cssW: number, cssH: number) {
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(cssW * dpr)
  canvas.height = Math.round(cssH * dpr)
  canvas.style.width = `${cssW}px`
  canvas.style.height = `${cssH}px`
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return ctx
}
```

- [ ] **Step 2: Implement CanvasStage**

`components/canvas/CanvasStage.tsx` renders four absolutely positioned `<canvas>` elements
in a relative container, in this DOM order so they stack correctly: image, mask, vector,
interaction. Only the top canvas receives pointer events.

```tsx
'use client'
import { useEffect, useRef } from 'react'
import { Renderer, sizeCanvas, type LayerContexts } from '@/lib/canvas/renderer'

export function CanvasStage() {
  const wrap = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLCanvasElement>(null)
  const maskRef = useRef<HTMLCanvasElement>(null)
  const vectorRef = useRef<HTMLCanvasElement>(null)
  const interRef = useRef<HTMLCanvasElement>(null)
  const renderer = useRef<Renderer | null>(null)

  useEffect(() => {
    const el = wrap.current!
    const resize = () => {
      const { width, height } = el.getBoundingClientRect()
      const ctxs: LayerContexts = {
        image:       sizeCanvas(imageRef.current!,  width, height),
        mask:        sizeCanvas(maskRef.current!,   width, height),
        vector:      sizeCanvas(vectorRef.current!, width, height),
        interaction: sizeCanvas(interRef.current!,  width, height),
      }
      renderer.current?.destroy()
      renderer.current = new Renderer(ctxs)
      renderer.current.invalidate('image', 'mask', 'vector', 'interaction')
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    return () => { ro.disconnect(); renderer.current?.destroy() }
  }, [])

  return (
    <div ref={wrap} className="relative h-full w-full overflow-hidden bg-[#080d14]">
      <canvas ref={imageRef}  className="absolute inset-0 pointer-events-none" />
      <canvas ref={maskRef}   className="absolute inset-0 pointer-events-none" />
      <canvas ref={vectorRef} className="absolute inset-0 pointer-events-none" />
      <canvas ref={interRef}  className="absolute inset-0" />
    </div>
  )
}
```

- [ ] **Step 3: Manual verification**

Add `<CanvasStage />` to `app/page.tsx` inside a full-height container. Run `npm run dev`.
In devtools, confirm four `<canvas>` elements exist and that `canvas.width` is larger than
the CSS width on a retina display.

- [ ] **Step 4: Commit**

```bash
cd ~/Desktop/code-folders/rookery && git add -A && git commit -m "Add layered canvas stage with dirty-flag renderer"
```

---

## Task 13: Sample photos and image layer

**Files:**
- Create: `public/samples/` with 4 lab bench photos
- Create: `lib/canvas/layers/image-layer.ts`

- [ ] **Step 1: Add sample photos**

Download four openly licensed lab bench photos (Unsplash or Pexels, both permit this use)
into `public/samples/` named `bench_01.jpg` through `bench_04.jpg`. Prefer images showing
pipettes, bottles, racks, and gloved hands. Record each one's pixel dimensions; the seed
script needs them.

- [ ] **Step 2: Implement the image layer**

```ts
import type { Viewport } from '../types'

export function drawImageLayer(
  ctx: CanvasRenderingContext2D,
  bitmap: ImageBitmap | null,
  v: Viewport,
) {
  if (!bitmap) return
  ctx.save()
  ctx.imageSmoothingEnabled = v.scale < 1   // smooth when shrinking, crisp when zoomed in
  ctx.setTransform(
    v.scale * (window.devicePixelRatio || 1), 0, 0,
    v.scale * (window.devicePixelRatio || 1),
    v.tx * (window.devicePixelRatio || 1),
    v.ty * (window.devicePixelRatio || 1),
  )
  ctx.drawImage(bitmap, 0, 0)
  ctx.restore()
}

/** Decode off the main thread so a large photo does not stall the page. */
export async function loadBitmap(url: string): Promise<ImageBitmap> {
  const res = await fetch(url)
  return createImageBitmap(await res.blob())
}
```

- [ ] **Step 3: Wire it into CanvasStage**

Load the active image's bitmap on change, store it in a ref, register
`renderer.setDraw('image', ctx => drawImageLayer(ctx, bitmapRef.current, viewport))`, and
call `renderer.invalidate('image')` when either the bitmap or the viewport changes.

- [ ] **Step 4: Manual verification**

A lab photo renders, centered, fit to the container.

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/code-folders/rookery && git add -A && git commit -m "Add sample photos and image layer rendering"
```

---

## Task 14: Pan and zoom

**Files:**
- Modify: `components/canvas/CanvasStage.tsx`

- [ ] **Step 1: Add wheel zoom and space-drag pan**

On `wheel`: `preventDefault()`, compute `factor = Math.exp(-e.deltaY * 0.0015)`, call
`zoomAt(viewport, offsetX, offsetY, factor, 0.1, 20)`, write to the store, then
`renderer.invalidate('image', 'mask', 'vector', 'interaction')`.

Track a `spaceDown` ref via keydown/keyup on `window`. While space is held, pointer drag
updates `tx` and `ty` by the pointer delta and invalidates all four layers. Set
`cursor: grab` while space is held.

- [ ] **Step 2: Manual verification**

Zoom with the scroll wheel and confirm the point under the cursor stays put. Hold space and
drag to pan. Both should feel smooth with no flicker.

- [ ] **Step 3: Commit**

```bash
cd ~/Desktop/code-folders/rookery && git add -A && git commit -m "Add wheel zoom and space-drag panning"
```

---

## Task 15: Vector layer and box tool

**Files:**
- Create: `lib/canvas/layers/vector-layer.ts`
- Create: `lib/canvas/layers/interaction-layer.ts`
- Create: `lib/canvas/tools/box-tool.ts`

- [ ] **Step 1: Implement the vector layer**

Draws every box and polygon in image space under the viewport transform. Stroke in the
class color at 2 CSS pixels (divide by `v.scale` so line weight stays constant on screen),
fill at 12% alpha. Draw the selected shape with a brighter stroke and 6px square handles at
each vertex.

- [ ] **Step 2: Implement the interaction layer**

Draws only transient things: the in-progress box outline, the polygon rubber band, the brush
cursor ring, and the hover highlight. Nothing here is ever committed to state.

- [ ] **Step 3: Implement the box tool**

Pointerdown records the image-space origin. Pointermove updates the preview rect and
invalidates **only** the interaction layer. Pointerup builds an `Annotation` with
`bboxFromBox` for normalization, pushes it through a command:

```ts
import { commandStack, useStore } from '@/lib/state/store'
import type { Annotation } from '../types'

export function commitBox(a: Annotation) {
  const { addAnnotation, removeAnnotation } = useStore.getState()
  commandStack.execute({
    label: 'Add box',
    do:   () => addAnnotation(a),
    undo: () => removeAnnotation(a.id),
  })
}
```

- [ ] **Step 4: Manual verification**

Drag out a box. While dragging, confirm in devtools that only the interaction canvas is
repainting. On release the box moves to the vector layer.

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/code-folders/rookery && git add -A && git commit -m "Add vector and interaction layers with box tool"
```

---

## Task 16: Select tool

**Files:**
- Create: `lib/canvas/tools/select-tool.ts`
- Modify: `components/canvas/CanvasStage.tsx`

- [ ] **Step 1: Wire the spatial index**

Rebuild the `SpatialIndex` whenever `annotationIds` changes. On pointermove with the select
tool, hit test and draw a hover outline on the interaction layer. On pointerdown, set
`selectedId` and invalidate the vector layer.

- [ ] **Step 2: Add drag-to-move**

Dragging a selected shape draws the moved copy on the interaction layer while the original
stays on the vector layer. On release, commit a move command that stores the delta so undo
just applies the inverse delta.

- [ ] **Step 3: Manual verification**

Click a box to select it. Handles appear. Drag it and drop it. `Cmd+Z` returns it to the
original position.

- [ ] **Step 4: Commit**

```bash
cd ~/Desktop/code-folders/rookery && git add -A && git commit -m "Add selection and drag-to-move"
```

---

## Task 17: Polygon tool

**Files:**
- Create: `lib/canvas/tools/polygon-tool.ts`

- [ ] **Step 1: Implement**

Click appends a vertex to a working `number[]`. Pointermove redraws the committed edges plus
a rubber band to the cursor, **on the interaction layer only**. This is the case that
justifies the fourth layer, so leave a comment saying so.

Close the polygon on `Enter`, on double click, or on clicking within 8 screen pixels of the
first vertex. Reject polygons with fewer than 3 vertices. `Escape` cancels.

On close: compute `bboxFromPoints` and commit through the command stack the same way the
box tool does.

**Do not run `simplify()` here.** Polygon vertices are click-placed, so every one was a
deliberate human decision. Simplification would silently delete a vertex the user placed
whenever three clicks land near-collinear, which reads as a bug. Simplify what a timer
sampled, never what a person clicked. Brush paths get simplified (Task 18); polygons do not.

- [ ] **Step 2: Manual verification**

Place 6 vertices. The rubber band follows the cursor. Confirm in devtools that the vector
canvas is not repainting during pointer moves. Close the polygon and confirm it appears.

- [ ] **Step 3: Commit**

```bash
cd ~/Desktop/code-folders/rookery && git add -A && git commit -m "Add polygon tool with interaction-layer rubber band"
```

---

## Task 18: Brush and erase

**Files:**
- Create: `lib/canvas/tools/brush-tool.ts`
- Create: `lib/canvas/layers/mask-layer.ts`

- [ ] **Step 1: Implement the mask layer**

Keep a `MaskBuffer` per in-progress mask annotation. To display it, write the buffer into an
`ImageData` tinted with the class color at 45% alpha, put it into an offscreen canvas sized
to the image, and `drawImage` that under the viewport transform. Rebuild the offscreen
canvas only when the buffer changes, not per frame.

- [ ] **Step 2: Implement the brush tool**

Pointerdown starts collecting points. On pointermove use `e.getCoalescedEvents()` so 120Hz
pointers contribute every sample, convert each to image space, append to a `Float32Array`
builder, stamp the new segment into the `MaskBuffer`, and invalidate the mask layer.

Draw the brush cursor ring on the interaction layer at all times while the tool is active.

On pointerup, commit:

```ts
commandStack.execute({
  label: mode === 'paint' ? 'Paint' : 'Erase',
  do:   () => { buffer.apply(stroke); syncAnnotationGeometry() },
  undo: () => { buffer.undo();        syncAnnotationGeometry() },
})
```

where `syncAnnotationGeometry()` writes `{ kind: 'mask', rle: encodeRLE(buffer.data),
width, height }` and a recomputed bbox back into the store.

Erase is the same tool with `mode: 'erase'`.

- [ ] **Step 3: Add brush size control**

`[` and `]` adjust `brushSize` by 2. Show the current size in the status bar.

- [ ] **Step 4: Manual verification**

Paint a region. It appears tinted in the class color. Erase part of it. `Cmd+Z` undoes one
stroke at a time, not the whole mask.

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/code-folders/rookery && git add -A && git commit -m "Add brush and erase tools with mask layer"
```

---

## Task 19: Undo, redo, and keyboard shortcuts

**Files:**
- Create: `components/panels/Toolbar.tsx`
- Create: `components/panels/StatusBar.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Global key handler**

Bind on `window`, and bail out when the event target is an `input`, `textarea`, or
`contenteditable` so typing an attribute value does not switch tools.

```
V select · B box · P polygon · D brush · E erase
Cmd/Ctrl+Z undo · Cmd/Ctrl+Shift+Z redo
Delete / Backspace  delete selected
[ ]  brush size
1-9  pick class by position
Escape  cancel in-progress shape
```

- [ ] **Step 2: Toolbar**

Five tool buttons with Lucide icons (`MousePointer2`, `Square`, `PenTool`, `Brush`,
`Eraser`), undo and redo buttons disabled from `commandStack.canUndo` / `canRedo`, and an
export button. Active tool gets a `#006495` background.

- [ ] **Step 3: Status bar**

Annotation count, class count, zoom percentage, brush size, and save status.

- [ ] **Step 4: Manual verification**

Every shortcut works. Undo and redo buttons disable correctly at the ends of the stack.

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/code-folders/rookery && git add -A && git commit -m "Add toolbar, status bar, and keyboard shortcuts"
```

---

## Task 20: Class registry and dynamic attribute panel

This is the feature the brief is really testing. Read spec section 7 before starting.

**Files:**
- Create: `components/panels/ClassPanel.tsx`
- Create: `components/panels/AttributePanel.tsx`

- [ ] **Step 1: Seed the built-in classes**

```ts
export const BUILT_IN_CLASSES: LabelClass[] = [
  { id: 'cls_pipette', key: 'pipette_tip', name: 'Pipette Tip', color: '#14B8A6',
    attributes: [
      { key: 'state', name: 'State', type: 'ENUM', options: ['Sealed', 'Used'], defaultValue: 'Sealed' },
    ]},
  { id: 'cls_bottle', key: 'reagent_bottle', name: 'Reagent Bottle', color: '#006495',
    attributes: [
      { key: 'liquid_level', name: 'Liquid Level', type: 'PERCENT', defaultValue: 100 },
      { key: 'state', name: 'State', type: 'ENUM', options: ['Open', 'Closed'], defaultValue: 'Closed' },
    ]},
  { id: 'cls_rack', key: 'tip_rack', name: 'Tip Rack', color: '#8B5CF6',
    attributes: [
      { key: 'occupancy', name: 'Occupancy', type: 'PERCENT', defaultValue: 100 },
    ]},
  { id: 'cls_tray', key: 'tray', name: 'Tray', color: '#F59E0B',
    attributes: [
      { key: 'slot', name: 'Slot', type: 'NUMBER' },
    ]},
  { id: 'cls_hand', key: 'gloved_hand', name: 'Gloved Hand', color: '#EF4444', attributes: [] },
  { id: 'cls_spill', key: 'spill', name: 'Spill', color: '#EC4899',
    attributes: [
      { key: 'hazard', name: 'Hazard', type: 'BOOLEAN', defaultValue: false },
    ]},
]
```

- [ ] **Step 2: Class panel**

List classes with a color swatch and the numeric shortcut. Clicking sets `activeClassId`.
A "New class" button opens a dialog for name, color, and a repeatable attribute row builder
(name, type dropdown, and an options field that appears only for `ENUM`). Saving calls
`addClass`.

- [ ] **Step 3: Attribute panel**

Reads the selected annotation, looks up its class, and renders one control per
`AttributeDef`. **The panel has no hardcoded knowledge of any specific attribute.** It
switches on `type` alone:

```tsx
switch (def.type) {
  case 'PERCENT':  return <input type="range" min={0} max={100} ... />
  case 'NUMBER':   return <input type="number" ... />
  case 'ENUM':     return <select>{def.options!.map(...)}</select>
  case 'BOOLEAN':  return <input type="checkbox" ... />
  case 'TEXT':     return <input type="text" ... />
}
```

Changes commit through the command stack so attribute edits are undoable:

```ts
const prev = annotation.attributes[def.name]
commandStack.execute({
  label: `Set ${def.name}`,
  do:   () => updateAnnotation(id, { attributes: { ...annotation.attributes, [def.name]: next } }),
  undo: () => updateAnnotation(id, { attributes: { ...annotation.attributes, [def.name]: prev } }),
})
```

- [ ] **Step 4: Manual verification**

Draw a shape, tag it Reagent Bottle, and confirm a percent slider and an Open/Closed dropdown
appear. Switch it to Gloved Hand and confirm the panel empties. Create a custom class with a
new enum attribute and confirm its controls render with no code change. Undo an attribute
change.

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/code-folders/rookery && git add -A && git commit -m "Add class registry and schema-driven attribute panel"
```

---

## Task 21: Image rail and upload

**Files:**
- Create: `components/panels/ImageRail.tsx`
- Create: `app/api/images/upload/route.ts`
- Create: `lib/db/supabase.ts`

- [ ] **Step 1: Supabase client**

```ts
import { createClient } from '@supabase/supabase-js'

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,   // server only, never bundled to the client
  { auth: { persistSession: false } },
)
```

- [ ] **Step 2: Upload route**

Accepts `multipart/form-data` with `file`, `width`, `height`. Uploads to the `lab-images`
bucket under a UUID key, creates the `ImageAsset` row with `source: 'UPLOADED'`, returns it.
Reject anything that is not `image/*` and anything over 20 MB.

- [ ] **Step 3: Image rail**

Thumbnails from `imageIds`, active one outlined in `#14B8A6`, annotation count badge per
image. A drop zone at the bottom reads `naturalWidth` and `naturalHeight` client side before
POSTing, so the server needs no image library.

- [ ] **Step 4: Manual verification**

Bundled photos appear. Dragging in a new photo uploads it and it becomes selectable.

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/code-folders/rookery && git add -A && git commit -m "Add image rail with upload to Supabase Storage"
```

---

## Task 22: Prisma schema and persistence

**Files:**
- Create: `prisma/schema.prisma`, `prisma/seed.ts`, `lib/db/prisma.ts`
- Create: `app/api/projects/[id]/route.ts`
- Create: `app/api/images/[id]/annotations/sync/route.ts`
- Create: `lib/state/sync.ts`

- [ ] **Step 1: Schema**

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")      // pooled, port 6543
  directUrl = env("DIRECT_URL")        // direct, port 5432, migrations only
}

generator client { provider = "prisma-client-js" }

model Project {
  id        String       @id @default(cuid())
  name      String
  images    ImageAsset[]
  classes   LabelClass[]
  createdAt DateTime     @default(now())
}

model ImageAsset {
  id          String       @id @default(cuid())
  projectId   String
  project     Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  filename    String
  source      ImageSource  @default(UPLOADED)
  url         String
  width       Int
  height      Int
  annotations Annotation[]
}

model LabelClass {
  id         String         @id @default(cuid())
  projectId  String
  project    Project        @relation(fields: [projectId], references: [id], onDelete: Cascade)
  key        String
  name       String
  color      String
  isBuiltIn  Boolean        @default(false)
  order      Int            @default(0)
  attributes AttributeDef[]
  annotations Annotation[]
  @@unique([projectId, key])
}

model AttributeDef {
  id           String     @id @default(cuid())
  labelClassId String
  labelClass   LabelClass @relation(fields: [labelClassId], references: [id], onDelete: Cascade)
  key          String
  name         String
  type         AttrType
  options      Json?
  defaultValue Json?
  order        Int        @default(0)
}

model Annotation {
  id           String         @id @default(cuid())
  imageId      String
  image        ImageAsset     @relation(fields: [imageId], references: [id], onDelete: Cascade)
  labelClassId String
  labelClass   LabelClass     @relation(fields: [labelClassId], references: [id])
  type         AnnotationType
  geometry     Json
  bbox         Json
  attributes   Json           @default("{}")
  updatedAt    DateTime       @updatedAt
  @@index([imageId])
}

enum ImageSource    { BUNDLED UPLOADED }
enum AnnotationType { BOX POLYGON MASK }
enum AttrType       { NUMBER PERCENT ENUM BOOLEAN TEXT }
```

- [ ] **Step 2: Environment**

Create `.env.example` and a real `.env` (gitignored):

```
DATABASE_URL="postgresql://...pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://...supabase.com:5432/postgres"
NEXT_PUBLIC_SUPABASE_URL="https://xxxx.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="..."
```

Then: `npx prisma migrate dev --name init`

- [ ] **Step 3: Seed**

`prisma/seed.ts` creates one project, the six built-in classes with their attributes, and
four `ImageAsset` rows pointing at `/samples/bench_0N.jpg` with `source: 'BUNDLED'` and the
real dimensions recorded in Task 13.

Run: `npx prisma db seed`

- [ ] **Step 4: Sync route**

```ts
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { created, updated, deleted } = await req.json()

  await prisma.$transaction([
    ...created.map((a: any) => prisma.annotation.create({ data: { ...a, imageId: id } })),
    ...updated.map((a: any) => prisma.annotation.update({ where: { id: a.id }, data: a })),
    prisma.annotation.deleteMany({ where: { id: { in: deleted } } }),
  ])

  return Response.json({ ok: true })
}
```

One transaction, so a dropped connection cannot leave half-saved state.

- [ ] **Step 5: Debounced sync client**

`lib/state/sync.ts` keeps three `Set<string>` of dirty ids. Every store mutation marks an id.
An 800ms trailing debounce flushes them in one request and sets `saveStatus`. **The canvas
never awaits this.** Also flush on `visibilitychange` so closing the tab does not lose work.

- [ ] **Step 6: Manual verification**

Draw several shapes, wait for "saved", refresh the page, confirm they are still there.
Check the network tab: one request per burst, not one per stroke.

- [ ] **Step 7: Commit**

```bash
cd ~/Desktop/code-folders/rookery && git add -A && git commit -m "Add Prisma schema and debounced batched autosave"
```

---

## Task 23: Export endpoint and download

**Files:**
- Create: `app/api/projects/[id]/export/route.ts`

- [ ] **Step 1: Route**

Load the project with images, classes, attributes, and annotations. Map the Prisma rows into
`ExportInput`, call `buildExport`, and return with:

```
Content-Type: application/json
Content-Disposition: attachment; filename="rookery-export-<date>.json"
```

- [ ] **Step 2: Toolbar button**

The export button opens the endpoint so the browser downloads the file.

- [ ] **Step 3: Manual verification**

Annotate one of each shape type, export, open the JSON, and confirm: `schema_version`
present, class attribute schemas present, every annotation has a `bbox`, polygon points are
nested pairs, and the mask has an `rle` array.

- [ ] **Step 4: Commit**

```bash
cd ~/Desktop/code-folders/rookery && git add -A && git commit -m "Add structured JSON export endpoint"
```

---

## Task 24: Polish

**Files:**
- Modify: `app/page.tsx` and the panel components

- [ ] **Step 1: Layout and theme pass**

Assemble the three-column layout from the spec. Apply the grid overlay to the canvas
container, radial glows behind the panels, `.eyebrow` labels on panel headers, and the
`#006495` to `#14B8A6` gradient on the app title.

- [ ] **Step 2: Empty and error states**

No image selected, no annotations yet, no class selected when a draw tool is picked, and an
upload failure toast.

- [ ] **Step 3: Full test run**

Run: `npm test`
Expected: all suites pass.

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
cd ~/Desktop/code-folders/rookery && git add -A && git commit -m "Polish layout, empty states, and theme details"
```

---

## Task 25: Architecture summary

**Files:**
- Create: `docs/ARCHITECTURE.md`
- Create: `README.md`

- [ ] **Step 1: Write ARCHITECTURE.md**

This is a graded deliverable, not an afterthought. Sections:

1. What the tool is and where it sits in the perception pipeline
2. Canvas performance: the four-layer split by lifetime, the rubber-band cost argument with
   the 1,800-redraws figure, dirty flags, rAF batching, coalesced pointer events, dpr sizing
3. State handling: normalized store, React owning chrome while an imperative loop owns the
   canvas, the command stack, and the snapshot table from spec 6.4 with real numbers
4. Data model: two-level class and attribute design, and why geometry and attributes are JSONB
5. Local-first sync and why the network is never in the interaction path
6. Deliberate omissions: no canvas library, no WASM, no WebGL, no auth, with reasons

- [ ] **Step 2: Write README.md**

What it is, a screenshot, setup steps, environment variables, `npm run dev`, and a link to
`docs/ARCHITECTURE.md` and the spec.

- [ ] **Step 3: Commit**

```bash
cd ~/Desktop/code-folders/rookery && git add -A && git commit -m "Add architecture summary and README"
```

---

## Deployment

- [ ] Push to GitHub. Decide visibility first: public, or private with Corvinus invited.
- [ ] Import the repo on Vercel.
- [ ] Add all four environment variables in the Vercel dashboard.
- [ ] Deploy, then verify the live URL loads sample photos, saves, and exports.

---

## If time runs short

Tasks 1 through 20 produce a complete, demoable product with no backend. Tasks 21 through 23
add persistence and export. Cut in this order: image upload (Task 21), then persistence
(Task 22), keeping export (Task 23) driven from local state. Never cut Task 25.
