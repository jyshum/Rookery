# Rookery — System Architecture

**Author:** Jared Shum
**Context:** Take-home assignment, Corvinus Labs

This document covers what the tool is, then the two things the brief asked me to
explain: canvas performance and state handling.

---

## 1. What this is, and why

Rookery is a browser-based annotation workspace for lab imagery. You open a
photo of a bench, trace the objects in it, tag each one with a class, and record
its state. The result exports as structured JSON a training pipeline can consume.

### Where it sits

Corvinus builds a robot that takes a natural-language protocol and executes it on
a real bench. To do that it has to read the bench. Not just "there is a bottle
there", but "that bottle is open and half full, so I can draw from it".

That reading is learned from labeled examples. This tool produces them.

```
bench and wrist cameras capture frames
              |
          >> ROOKERY <<     humans trace objects and record state
              |
     structured JSON dataset
              |
   train perception models (detect, segment, classify state)
              |
   perception grounds language for the VLA and feeds the spatial map
              |
        robot executes the protocol
              |
      failures logged and returned for relabeling
```

It is a loop, not a one-shot: the human-in-the-loop stage of a data engine.

### Scope boundary, stated plainly

Rookery produces **perception and state supervision**. It does not produce action
labels — those come from teleoperation demonstrations. Being explicit about that
line matters more than claiming more surface than the tool has.

### Why the attributes are the interesting part

`Liquid Level: 50%` and `State: Open` are not geometry. They are world state, and
they are preconditions. "Draw 200µL from reagent A" is only executable if A is
open and has volume. Geometry tells the robot where not to collide. Attributes
tell it what it is allowed to do next.

---

## 2. Canvas performance

### The problem

A canvas is one flat surface with no notion of layers. Changing anything means
clearing and redrawing all of it. Painting a brush stroke on a single canvas
means repainting the photo underneath sixty times a second.

### Four stacked canvases, split by lifetime

The split is **not** by tool. It is by how long a thing lives.

| Layer | Holds | Repaints on |
|---|---|---|
| 1. Image | the photo | pan, zoom, image switch |
| 2. Mask | painted pixels | a committed brush or erase stroke |
| 3. Vector | finished boxes and polygons | a shape added, moved, deleted |
| 4. Interaction | rubber band, cursor ring, hover, drag preview | every frame, on a near-empty surface |

### The case that justifies the fourth layer

The clearest one is the polygon rubber band, not the brush.

Suppose 30 polygons are already on the image. You start polygon 31, and a line
follows your cursor previewing the next edge. A canvas cannot erase one element,
so if that line lives on the vector layer:

```
pointer moves -> clear vector layer -> redraw all 30 polygons -> draw the line
```

Sixty times a second. Roughly **1,800 polygon redraws per second to animate one
line.**

On its own layer it is one path on an empty surface, and the 30 committed shapes
are never touched.

> **Principle:** temporary things change every frame, permanent things almost
> never do. Share a canvas between them and you pay the permanent redraw cost at
> the temporary frequency.

This is enforced mechanically, not by convention:

```
it('never repaints a clean layer', () => {
  for (let i = 0; i < 60; i++) { r.invalidate('interaction'); tick() }
  expect(r.repaints.interaction).toBe(60)
  expect(r.repaints.image).toBe(0)
  expect(r.repaints.vector).toBe(0)
  expect(r.repaints.mask).toBe(0)
})
```

The renderer exposes per-layer repaint counters specifically so the claim is
observable rather than asserted.

### Supporting techniques

| Technique | What it buys |
|---|---|
| Dirty flag per layer | A layer that did not change is never repainted |
| `requestAnimationFrame` batching | 50 invalidations in one frame produce exactly 1 repaint (tested) |
| `getCoalescedEvents()` | A 120Hz pointer contributes every sample, so fast strokes stay smooth |
| Stroke interpolation | A fast drag leaves a solid line, not a dotted one (tested) |
| `ctx.setTransform` for pan/zoom | One matrix; annotation geometry always stays in image space |
| devicePixelRatio sizing | Crisp hairlines on retina, with draw functions still working in CSS pixels |
| `createImageBitmap()` | Photos decode off the main thread instead of stalling the page |
| Spatial grid hit testing | A hover test inspects shapes near the cursor, not all of them |
| Tinted-mask caching | A 1600x1067 mask to RGBA is a 6.8 MB conversion; cached against a version counter |

### Data layout

Point data is stored as flat `Float32Array` (`[x, y, x, y, ...]`), not arrays of
`{x, y}` objects. One contiguous block instead of thousands of tracked objects:
smaller, faster to iterate, and no garbage-collection pause in the middle of a
stroke. Pointer handlers avoid allocating in their hot path for the same reason.

### What I deliberately did not use

**No canvas library.** Konva or Fabric would have been faster to build with. But
then every performance decision above belongs to the library, and the brief asked
me to explain my canvas performance choices. You cannot explain a decision you
did not make.

**No WebAssembly, no WebGL.** Both were considered. At this scale the bottleneck
is redundant repaints, not compute, and layering plus dirty-rect repainting solve
that in JavaScript. If mask size or image count grew an order of magnitude, GPU
compositing would be the next move — not before.

---

## 3. State handling

### Store shape

Zustand, normalized. Annotations are keyed by id in a flat record rather than
nested in arrays, so editing one replaces one entry and only its consumers are
invalidated.

```
{
  images:      { byId, allIds, activeId },
  annotations: { byId, allIds, selectedId },
  classes:     { byId, allIds },
  ui:          { tool, viewport, brushSize, saveStatus, exportOpen }
}
```

A test asserts *identity*, not equality, because that is what makes the
normalization actually pay off:

```
it('leaves other annotations untouched when one is edited', () => {
  const before = state.annotations.a1
  updateAnnotation('a2', { bbox: [5,5,5,5] })
  expect(state.annotations.a1).toBe(before)   // same object
})
```

### React does not own the canvas

React re-renders are the enemy of a 60fps loop. If a pointer move triggered a
render, the frame is already lost.

So the canvas subscribes to the store imperatively and repaints itself. React
renders only the surrounding panels. Selector subscriptions mean editing an
attribute re-renders the attribute panel and nothing else; the canvas never
re-renders at all.

> **React owns the chrome. An imperative loop owns the canvas. They share a
> store, not a render cycle.**

### Undo: store the action, not the result

The common approach is to deep-copy state after each edit and swap an old copy
back. Fine for boxes and polygons. It fails for the brush: a painted mask on a 4K
image is ~33 MB of raw pixels, so thirty strokes exhaust memory.

Every edit is instead a command that knows how to apply and invert itself.

| Edit | What the command stores |
|---|---|
| Add shape | the shape |
| Move shape | the delta (undo is the opposite delta) |
| Change attribute | previous and next value |
| Change class | previous class and previous attributes |
| Brush stroke | the cursor path, radius, and mode |

Every one is kilobytes.

### The snapshot tradeoff

Canvas painting is destructive. Stroke 100 overwrote what was beneath it and that
information is gone, so undo cannot subtract a stroke. It has to rebuild by
replaying.

Pure replay cost grows with session length:

| Strokes made | Replays on undo | Freeze |
|---|---|---|
| 50 | 49 | ~100ms |
| 200 | 199 | ~400ms |
| 500 | 499 | ~1s |

An annotator hits undo constantly, so this gets worse exactly as they work
longer.

**Fix:** snapshot the mask every 20 strokes. Undo restores the nearest snapshot
and replays only from there, so it never replays more than 20 strokes regardless
of how long the session ran.

| Snapshot interval | Memory | Replays | Verdict |
|---|---|---|---|
| every stroke | ~830 MB at 100 strokes | 0 | crashes the tab |
| **every 20 strokes** | **~10 MB** | **≤ 19** | **chosen** |
| never | ~0 | up to 499 | 1s freeze |

Unit note: 830 MB assumes the naive path, where `getImageData()` returns four
bytes per pixel. Snapshots store the mask packed at one byte per pixel, so a
full-HD snapshot is ~2 MB and a rolling window of five is ~10 MB.

**Undo is constant time instead of growing with session length, and drawing
stays instant because it never replays at all.**

Two tests hold this: one asserts replay stays ≤ 20 after 500 strokes, and one
builds a second buffer the naive way with no snapshots at all and asserts the
pixels come out byte-identical. The second one matters more — it proves the
optimization does not change the answer.

### Mask pixels live outside the store

The store holds what persists and exports: the run-length encoding. The working
bitmap and its stroke history live in a separate registry. Several megabytes of
pixels should not be diffed by a state library or copied on every render.

---

## 4. Data model

### Two levels of labels

This is the part the brief is really testing.

**A class declares which questions get asked:**

```
LabelClass "Reagent Bottle"
  AttributeDef "Liquid Level"  PERCENT
  AttributeDef "State"         ENUM ["Open", "Closed"]
```

**An annotation holds the answers:**

```
Annotation #47
  class:      Reagent Bottle
  geometry:   polygon around this bottle in this photo
  attributes: { "Liquid Level": 50, "State": "Open" }
```

The attribute panel has **no branch anywhere for "Liquid Level" or "State"**. It
reads the selected annotation's class, walks its declared schema, and renders one
control per entry based on `type` alone. Invent a class at runtime with a
"Barcode" text attribute and the control appears, with no code change. That is
demonstrated in the walkthrough.

Reassigning a class replaces attributes with the new class's defaults rather than
carrying them over — a Reagent Bottle's liquid level is meaningless on a Gloved
Hand, and keeping it would put keys in the export the schema never declared. The
old values are preserved for undo.

### Geometry

Three shapes, three representations:

```
box      { "x": 409, "y": 220, "w": 92, "h": 170 }
polygon  { "points": [[412,220], [498,220], [501,390]] }
mask     { "rle": [...], "width": 1600, "height": 1067 }
```

Masks encode as run-length. A real measured example from this app: a
**1600x1067 mask, 1,707,200 pixels, encoded as 145 integers.**

Every annotation also carries a computed `bbox` regardless of type, because
detection pipelines expect one and no consumer should have to decode an RLE to
find it.

### Simplify what a timer recorded, never what a person clicked

Brush paths run through Ramer-Douglas-Peucker: the pointer samples on a timer
rather than on curvature, so most points are jitter. A test feeds 200 samples and
asserts it reduces to under 10 with no visible change.

Polygon vertices are **not** simplified. A person clicked each one deliberately,
and simplifying would silently delete a vertex whenever three clicks landed
near-collinear. That reads as the tool losing your work.

---

## 5. Export

The exported JSON is the actual product, so it is designed and tested rather than
serialized ad hoc at the end of a route handler. `buildExport` is a pure function
with no database or request awareness, which keeps the format under test without
standing up a server.

```json
{
  "schema_version": "1.0",
  "exported_at": "2026-09-03T19:17:38.869Z",
  "project": { "id": "prj_local", "name": "Lab Bench Dataset" },
  "classes": [{
    "id": "reagent_bottle",
    "name": "Reagent Bottle",
    "color": "#38BDF8",
    "attributes": [
      { "name": "Liquid Level", "type": "percent" },
      { "name": "State", "type": "enum", "options": ["Open", "Closed"] }
    ]
  }],
  "images": [{
    "id": "img_bench_01", "file": "bench_01.jpg", "width": 1600, "height": 1067,
    "annotations": [{
      "id": "...", "class": "reagent_bottle", "type": "box",
      "geometry": { "x": 285, "y": 718, "w": 210, "h": 255 },
      "bbox": [285, 718, 210, 255],
      "attributes": { "Liquid Level": 100, "State": "Closed" }
    }]
  }]
}
```

Two decisions worth naming:

- **Images with zero annotations are still exported.** A dataset needs to
  distinguish "reviewed and empty" from "never looked at". Dropping them
  conflates the two and quietly corrupts training.
- **Export order is stable.** It iterates insertion-ordered id arrays, not
  `Object.values`, so two exports of identical state produce identical bytes.
  That matters for diffing datasets.

The preview drawer renders this document with syntax colouring. Because class
names, enum options and text values are user-authored, the highlighter escapes
`&`, `<` and `>` **before** wrapping tokens, so nothing typed into the app can
survive as markup. Two tests pin that, using `<script>` as a key and an
`onerror` payload as a value.

---

## 6. Testing strategy

**136 tests across 13 suites.** The split is deliberate.

| Area | Suite | Tests |
|---|---|---|
| Geometry | `geometry` | 17 |
| Mask buffer and snapshots | `mask-buffer` | 22 |
| Store | `store` | 13 |
| Export builder | `build-export` | 12 |
| Command stack | `commands` | 10 |
| Annotation commands | `annotation-commands` | 10 |
| Renderer dirty flags | `renderer` | 9 |
| RLE | `rle` | 9 |
| Viewport transform | `transform` | 8 |
| Hit testing | `hit-test` | 8 |
| Store to export mapping | `from-store` | 7 |
| Path simplification | `simplify` | 6 |
| JSON highlighter escaping | `highlight` | 5 |

Pure logic is tested properly, because that is where bugs hide and where a test
is cheaper than a manual check. Canvas rendering and React panels are verified by
hand instead — asserting on pixels is slow, brittle, and in practice misleading.

That last point is not theoretical. Twice during development a hand-rolled
pixel-sampling check reported a failure that turned out to be a stale
`getImageData` readback rather than an application bug. A screenshot settled both
in seconds. Rendering is verified by looking at it.

---

## 7. Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16, App Router, TypeScript | Matches the Corvinus site; one deploy covers UI and API |
| Styling | Tailwind v4 | Theme tokens extracted from corvinuslabs.io computed styles |
| Fonts | Lora, JetBrains Mono | Same as the Corvinus site |
| Icons | Lucide | Same as the Corvinus site |
| State | Zustand + a hand-written command stack | Small, unopinionated, stays out of the render loop |
| Canvas | Hand-rolled Canvas2D, four layers | See section 2 |
| Tests | Vitest | Fast, no config fight with the Next toolchain |

---

## 8. What is not built, and why

Each of these is a scope decision, not an oversight.

| Not built | Reasoning |
|---|---|
| **Persistence** | Schema and route design are specified in the spec. The canvas and state layers are what the brief asked me to explain, and they got the time. State is in-memory; a refresh clears it. |
| **Authentication** | Not the graded surface, and it would have cost a day. |
| **Multi-user conflict handling** | With no shared backend there is nothing to conflict. When persistence lands, session-scoped project ids are the cheap correct answer: no auth, no shared row, no way for one annotator to clobber another. |
| **Model-assisted pre-labeling** | The natural next feature, and the app is already shaped for it: a model-drawn shape and a human-drawn shape are the same record. It is also how the human's share of the work shrinks over time. |
| **COCO / YOLO export** | The RLE and bbox conventions were chosen to make these a mapping layer, not a rewrite. |
| **Moving a mask** | `translateGeometry` refuses masks and says why: their pixels are baked at absolute positions, so moving one means re-rasterizing and re-encoding. Refusing beats silently producing a wrong mask. Tested. |

---

## 9. Known tradeoffs

1. **Polygon and brush overlap.** Both are in the brief and both are justified —
   polygon for rigid glassware, brush for spills, hands and tubing. But an
   experienced annotator could work with one fewer tool.
2. **Undo history is per-session.** Stroke history does not survive a reload, only
   the resulting pixels would. A loaded mask can be undone back to its loaded
   state, not into a previous session's individual strokes.
3. **Masks in JSONB.** Fine at demo scale, roughly 20-50 KB each. Past that they
   move to object storage as PNGs with a path reference.
4. **Single project.** The schema supports many; the UI ships with one to keep
   the demo tight.
