# Rookery — Design Spec

**Date:** 2026-09-02
**Author:** Jared Shum
**Context:** Take-home assignment, SWE internship, Corvinus Labs
**Status:** Approved, ready for implementation planning

---

## 1. What this is

Rookery is a browser-based image annotation workspace for lab imagery. A person opens a
photo of a lab bench, traces the objects in it, tags each one with a class, and records its
state. The result exports as structured JSON that a machine learning training pipeline can
consume directly.

### Why it exists

Corvinus builds a robot that takes a natural language protocol and executes it on a real
bench. To do that it has to read the bench. Not just "there is a bottle there," but "that
bottle is open and half full, so I can draw from it."

That reading is learned from labeled examples. This tool produces them.

Two things a general purpose vision model cannot give you:

1. **Lab-specific objects.** The internet has millions of labeled pictures of cups and dogs.
   It has essentially none of a specific pipette tip, on a specific bench, under that lab's
   lighting, half occluded by a gloved hand. That data does not exist. It has to be made.
2. **Object state.** Detection tells the robot where things are. It does not tell the robot
   whether a bottle is open or how much liquid is left. Those are preconditions for
   executing a protocol step. Getting them wrong destroys samples.

### Where it sits in the pipeline

```
bench + wrist cameras capture frames
            |
        >> ROOKERY <<        humans trace objects and record state
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

It is a loop, not a one-shot. Rookery is the human-in-the-loop stage of a data engine.

### Scope boundary, stated honestly

Rookery produces **perception and state supervision**. It does not produce action labels.
Those come from teleoperation demonstrations. Being explicit about that boundary is part of
the deliverable.

---

## 2. Users

| User | What they do |
|---|---|
| ML engineer at Corvinus | Bootstraps a dataset from raw bench footage |
| Lab tech or RA | Bulk labeling. Non-technical. Reason the tool is browser-based with no install |
| Partner institution | Stanford, UW, Princeton, Oregon State, NYU, LabOS. Every bench looks different. Distributed annotation is how the model generalizes past one lab |
| ML engineer, error analysis | Model misread a frame. Open it, check ground truth, correct, retrain |

The tool is also the answer key. You cannot measure whether the robot reads the bench
correctly without a set of images where the correct answer is already known.

---

## 3. Scope

### In scope

- Four annotation tools: bounding box, polygon, brush, mask erase
- Pan and zoom, keyboard-driven workflow
- Class registry: predefined lab classes plus user-created classes at runtime
- Per-class attribute schemas with five value types
- Per-annotation attribute values
- Undo and redo across every edit type including brush strokes
- Persistence to Postgres with debounced autosave
- Image upload to object storage, plus bundled sample photos
- Structured JSON export
- Corvinus Labs visual theme
- Written architecture summary

### Out of scope

Deliberately excluded to protect the time budget. Each is a defensible cut, not an oversight.

- Authentication and multi-user accounts
- Model-assisted pre-labeling
- COCO and YOLO export formats
- Video and frame sequences
- Real-time collaboration
- WebAssembly or WebGL rendering. See section 5.7

---

## 4. Interface

Single screen. Annotation is a focus task and page navigation costs the annotator time.

```
+------------------------------------------------------------+
|  select  box  polygon  brush  erase        undo redo  export|
+----------+----------------------------------+--------------+
|          |                                  |  CLASS       |
|  image   |                                  |  Pipette Tip |
|  rail    |            CANVAS                |  Reagent Btl |
|          |                                  |  + new class |
| [thumb]  |     lab photo with traces        +--------------+
| [thumb]  |                                  |  ATTRIBUTES  |
| [thumb]  |                                  |  Liquid: 50% |
|          |                                  |  State: Open |
| upload   |                                  |              |
+----------+----------------------------------+--------------+
|  12 annotations · 3 classes · zoom 140% · saved             |
+------------------------------------------------------------+
```

### Tool rationale

The four tools are four points on a speed versus precision curve. The annotator picks per
object.

| Tool | Effort | Use for |
|---|---|---|
| Box | one drag | Coarse localization. Fast. |
| Polygon | 8 to 15 clicks | Rigid labware. Trays, racks, bottles. True silhouette. |
| Brush | freehand | Amorphous regions. Spills, liquid, gloved hands, tubing. |
| Erase | freehand | Fix overpaint. Cut out occluding objects so only visible pixels are labeled. |

Why precision matters: a bounding box around a diagonal pipette is roughly 70% empty bench.
The robot then plans around space that is actually free. And `Liquid Level: 50%` requires
knowing where the liquid boundary sits, which no rectangle can express.

Give annotators only polygon and labeling takes five times as long. Give them only boxes and
the data is too coarse to plan a grasp or read a level. Hence all four.

### Keyboard

`V` select · `B` box · `P` polygon · `D` draw · `E` erase · `[` `]` brush size ·
`space+drag` pan · `Cmd+Z` undo · `Cmd+Shift+Z` redo · `Delete` remove · `1-9` pick class

---

## 5. Canvas architecture

This is a graded deliverable. The brief asks for canvas performance choices.

### 5.1 The problem

A canvas is one flat surface. Any change normally means repainting all of it. Painting with a
brush means sixty full repaints a second, including redrawing the photo underneath. It gets
choppy fast.

### 5.2 Four stacked canvases

Split by **lifetime**, not by tool. Permanent things versus temporary things.

| Layer | Holds | Repaints on |
|---|---|---|
| 1. Image | the photo | pan, zoom, image switch |
| 2. Mask | painted pixels | each new brush segment during a drag |
| 3. Vector | finished boxes and polygons | shape added, moved, deleted |
| 4. Interaction | rubber band, cursor ring, hover, handles, drag preview | every frame, on a near-empty surface |

### 5.3 Why the interaction layer earns its place

The clearest case is the polygon rubber band, not the brush.

Suppose 30 polygons are already drawn. You start polygon 31, and a line follows your cursor
to preview the next edge. A canvas cannot erase one element. You clear it and redraw. So if
that line lives on the vector layer:

```
mouse moves -> clear vector layer -> redraw all 30 polygons -> draw the line
```

Sixty times a second. 1,800 polygon redraws per second to move one line.

On its own layer:

```
mouse moves -> clear a near-empty canvas -> draw one line
```

The 30 polygons are never touched.

**Principle:** temporary things change every frame, permanent things almost never change. If
they share a canvas, you pay the permanent redraw cost at the temporary frequency.

Note: a brush stroke can safely composite straight onto the mask layer as you drag, because
painting is additive and nothing needs undoing mid-stroke. The interaction layer is for
things that never become permanent.

### 5.4 Supporting techniques

- Pan and zoom via `ctx.setTransform()`, one matrix, no coordinate recomputation
- `devicePixelRatio` scaling so lines are crisp on retina
- A dirty flag per layer. A layer that did not change does not repaint
- All repaints batched through `requestAnimationFrame`, never per pointer event
- `getCoalescedEvents()` so 120Hz pointers and tablets produce smooth strokes, not jagged ones
- Interpolation between pointer samples so fast drags leave no gaps
- Dirty rectangles: repaint only the changed region. A brush stroke touches maybe 2% of screen
- Hit testing by geometry math with a spatial grid, not by rendering and reading pixels
- `willReadFrequently: true` on contexts we sample pixels from
- `createImageBitmap()` to decode photos off the main thread

### 5.5 Data layout

Points stored as flat `Float32Array` like `[x,y,x,y,...]`, not arrays of objects. One
contiguous block instead of thousands of tracked objects. Smaller, faster to iterate, and no
garbage collection pauses mid-stroke.

No allocation inside pointer handlers. Objects created in a hot loop become garbage the
browser must collect, and collection pauses drop frames.

### 5.6 Path simplification

Traced outlines capture far more points than the shape needs. Ramer-Douglas-Peucker reduces
them. Smaller payload, faster render, cleaner export.

### 5.7 What is deliberately not used

**No canvas library.** Konva and Fabric would be faster to build with. But then every
performance decision belongs to the library and none of it can be defended. The brief asks
for canvas performance choices, and you cannot explain choices you did not make.

**No WebAssembly, no WebGL.** Both are real options and both were considered. At this scale
the bottleneck is redundant repaints, not compute. Layering and dirty-rect repainting solve
it in JavaScript. If mask size or image count grew an order of magnitude, GPU compositing
would be the next move.

---

## 6. State architecture

The second graded deliverable.

### 6.1 Store shape

Zustand, normalized. Annotations keyed by id rather than nested in arrays, so editing one
does not invalidate the rest.

```
{
  images:      { byId, allIds, activeId },
  annotations: { byId, allIds, selectedId },
  classes:     { byId, allIds },
  ui:          { tool, zoom, pan, brushSize, saveStatus }
}
```

### 6.2 React does not own the canvas

React re-renders are the enemy of a 60fps loop. If a pointer move triggers a React render,
the frame is already lost.

So the canvas runs its own imperative loop reading the store directly. React renders only
the surrounding panels. Zustand selector subscriptions mean editing an attribute re-renders
the attribute panel and nothing else. The canvas never re-renders. It repaints.

**React owns the chrome. An imperative loop owns the canvas. They share a store, not a
render cycle.**

### 6.3 Undo and redo

Undo must work across every edit type. The naive approach is to deep-copy state after each
change and swap back. That is fine for boxes and polygons. It fails for the brush.

A painted mask on a 4K photo is about 33 MB of raw pixels. Copy that per stroke and thirty
strokes have consumed a gigabyte. The tab dies.

**Store the action, not the result.**

Every edit becomes a command object that knows how to apply itself and how to invert itself.
Add shape. Move vertex. Change attribute. Paint stroke.

A brush stroke is stored as the path the cursor took plus radius plus paint-or-erase mode.
A few KB instead of 33 MB. Undo pops it off the stack.

### 6.4 The snapshot tradeoff

Canvas painting is destructive. You cannot subtract stroke 100 from the bitmap, because it
covered what was underneath and that information is gone.

So undo has to rebuild: clear the bitmap, replay strokes 1 through 99.

Cost of pure replay:

| Strokes made | Replays on undo | Freeze |
|---|---|---|
| 50 | 49 | ~100ms |
| 200 | 199 | ~400ms |
| 500 | 499 | ~1s |

Annotators hit undo constantly. A one second freeze makes the tool feel broken.

**Fix:** snapshot the mask bitmap every 20 strokes. Undo loads the nearest snapshot and
replays only from there. Undo at stroke 100 replays 19. Undo at stroke 500 replays 19. The
cost stopped growing.

The knob, and where it is set:

| Snapshot interval | Memory | Replays | Verdict |
|---|---|---|---|
| every stroke | ~830 MB at 100 strokes | 0 | crashes |
| **every 20 strokes** | **~10 MB** | **19** | **chosen** |
| never | ~0 | up to 499 | 1s freeze |

Unit note: the 830 MB figure assumes the naive path, where `getImageData()` hands back four
bytes per pixel. Our snapshots store the mask packed at one byte per pixel, so a full-HD mask
is about 2 MB and a rolling window of five snapshots is 10 MB total.

**Undo is constant time instead of growing with session length. Drawing stays instant
because it never replays at all.**

---

## 7. Data model

### Where things live

| Store | Holds |
|---|---|
| Supabase Postgres | Projects, classes, attribute definitions, annotations |
| Supabase Storage | Uploaded photo files |
| Repo `/public` | Bundled sample photos |

Sample photos ship in the repo rather than Storage so the demo works even on bad wifi.
Each image row records its source.

### Schema

```
Project
 |-< ImageAsset      filename, source(BUNDLED|UPLOADED), url, width, height
 |-< LabelClass      key, name, color, isBuiltIn, order
      |-< AttributeDef   key, name, type, options, defaultValue, required, order

ImageAsset -< Annotation
                |- labelClassId
                |- type        BOX | POLYGON | MASK
                |- geometry    Json
                |- bbox        Json, always computed
                |- attributes  Json
```

Attribute types: `NUMBER`, `PERCENT`, `ENUM`, `BOOLEAN`, `TEXT`.

### The two-level label system

This is what the brief is testing.

**A class defines which questions get asked.**

```
LabelClass "Reagent Bottle"
  AttributeDef "Liquid Level"  PERCENT
  AttributeDef "State"         ENUM ["Open","Closed"]
```

**An annotation holds the answers.**

```
Annotation #47
  class:      Reagent Bottle
  geometry:   polygon around this bottle in this photo
  attributes: { "Liquid Level": 50, "State": "Open" }
```

Tag a shape as a Reagent Bottle and the panel renders a percent control and an Open/Closed
dropdown, because the class said to. A user can define a new class with new attributes at
runtime and the UI adapts with no code change.

### Why geometry and attributes are JSONB

The textbook-relational alternative is one row per attribute value. It is more normalized,
but every read needs a join and a pivot, and attributes are always read together anyway.

JSONB keeps flexibility without giving up queryability:

```sql
where attributes->>'State' = 'Open'
```

Different classes genuinely have different attributes, which fixed columns cannot express.

Geometry follows the same reasoning, three shape types with three structures:

```
box      { "x": 409, "y": 220, "w": 92, "h": 170 }
polygon  { "points": [[412,220],[498,220],[501,390]] }
mask     { "rle": [0,142,8,97], "width": 1920, "height": 1080 }
```

Masks land around 20 to 50 KB as run-length encoding. Acceptable at this scale. Past that
they would move to Storage as PNGs with a path reference.

---

## 8. Backend

Four pieces:

| Piece | Job |
|---|---|
| Next.js route handlers | The API |
| Prisma | TypeScript to database |
| Supabase Postgres | The database |
| Supabase Storage | Uploaded files |

The Supabase JS client is used only for Storage. All database access goes through Prisma.
Prisma gives generated types, migrations, and keeps the API layer portable. Supabase is the
host, Prisma is the interface, and swapping hosts is a connection string change.

### Routes

```
GET    /api/projects/:id                 project, images, classes, attributes
GET    /api/images/:id/annotations
POST   /api/images/:id/annotations/sync  batched create, update, delete
DELETE /api/annotations/:id
POST   /api/images/upload                file to Storage, row to Postgres
GET    /api/classes    POST /api/classes    PATCH /api/classes/:id
GET    /api/projects/:id/export          the JSON deliverable
```

### The network is never in the interaction path

While drawing, everything is local. Nothing waits on a server. Unplug the network mid-stroke
and the canvas does not stutter.

A background sync flushes on an 800ms idle debounce, batched into one request rather than
one per stroke.

```
draw -> local store (instant) -> canvas repaints
             |
        800ms idle
             |
    one batched POST -> Postgres
```

Same principle as the canvas layering. Keep slow things out of the loop that must feel
instant.

Sync is wrapped in a transaction, so a dropped connection cannot leave half-saved state.

### Upload flow

The file goes to our own route, not browser-direct to Supabase, so the service key stays
server side.

```
1. browser reads naturalWidth and naturalHeight locally
2. POST file plus dimensions to /api/images/upload
3. route pushes file to Supabase Storage
4. route creates ImageAsset row with returned URL
5. returns the row, image rail updates
```

Reading dimensions client side avoids a server image-processing dependency.

---

## 9. Export format

The output is the product, so it is designed rather than bolted on.

```json
{
  "schema_version": "1.0",
  "exported_at": "2026-09-02T14:22:10Z",
  "project": { "id": "prj_01", "name": "Bench Set A" },
  "classes": [
    {
      "id": "reagent_bottle",
      "name": "Reagent Bottle",
      "color": "#14B8A6",
      "attributes": [
        { "name": "Liquid Level", "type": "percent" },
        { "name": "State", "type": "enum", "options": ["Open", "Closed"] }
      ]
    }
  ],
  "images": [
    {
      "id": "img_01",
      "file": "bench_01.jpg",
      "width": 1920,
      "height": 1080,
      "annotations": [
        {
          "id": "ann_01",
          "class": "reagent_bottle",
          "type": "polygon",
          "geometry": { "points": [[412,220],[498,220],[501,390],[409,388]] },
          "bbox": [409, 220, 92, 170],
          "attributes": { "Liquid Level": 50, "State": "Open" }
        }
      ]
    }
  ]
}
```

Every annotation carries a computed `bbox` regardless of type, because training pipelines
usually expect one. Masks export as RLE, the same encoding COCO uses.

---

## 10. Theme

Extracted from corvinuslabs.io computed styles, so it matches rather than approximates.

| Token | Value |
|---|---|
| Background | `#0A0A0B` |
| Panel | `#080d14` |
| Footer / deep | `#050505` |
| Primary | `#006495` |
| Accent | `#14B8A6` |
| Surface | `rgba(255,255,255,0.05)` |
| Border | `rgba(255,255,255,0.10)` |
| Text | `#F3F4F6` primary, `#6B7280` muted |
| Heading font | Lora, weight 500 |
| UI font | JetBrains Mono |

Signature details to reproduce: faint 1px grid overlay at ~8% opacity, soft radial glows in
primary and accent, small uppercase mono labels with wide letter spacing, and the blue to
teal gradient on emphasis words.

---

## 11. Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16, App Router, TypeScript |
| Styling | Tailwind v4 plus shadcn/ui |
| Icons | Lucide |
| State | Zustand, normalized, plus a command stack |
| Canvas | Hand-rolled Canvas2D, four layers |
| ORM | Prisma |
| Database | Supabase Postgres |
| File storage | Supabase Storage |
| Hosting | Vercel |

---

## 12. File structure

```
app/
  api/
    projects/[id]/route.ts
    projects/[id]/export/route.ts
    images/upload/route.ts
    images/[id]/annotations/sync/route.ts
    classes/route.ts
  page.tsx
components/
  canvas/          layer components, the render loop, tool handlers
  panels/          class picker, attribute editor, image rail
  ui/              shadcn primitives
lib/
  canvas/          geometry, hit testing, rle, simplify, transform
  state/           store slices, command stack, sync
  prisma.ts
  supabase.ts
prisma/
  schema.prisma
  seed.ts
public/samples/    bundled lab photos
docs/
  ARCHITECTURE.md  the written deliverable
```

---

## 13. Build phases

| Phase | Content |
|---|---|
| 1 | Scaffold, theme tokens, layout shell, sample photos rendering on a layered canvas |
| 2 | Viewport transform, pan, zoom, box tool, selection, hit testing |
| 3 | Polygon tool with rubber band on the interaction layer |
| 4 | Mask layer, brush, erase, RLE encoding |
| 5 | Command stack, undo, redo, mask snapshots |
| 6 | Class registry, attribute schemas, dynamic attribute panel |
| 7 | Prisma, Supabase, sync endpoint, autosave, upload |
| 8 | Export endpoint and download |
| 9 | Keyboard shortcuts, empty states, polish |
| 10 | ARCHITECTURE.md and demo rehearsal |

Phases 1 through 6 produce a complete demoable product with no backend. If time runs short,
7 and 8 are the compressible ones.

---

## 14. Demo narrative

Opening, roughly 60 seconds:

> Corvinus is building a robot that takes a natural language protocol and runs it on a real
> bench. To do that it has to read the bench. Not just "there is a bottle there," but "that
> bottle is open and half full, so I can draw from it."
>
> That reading has to be learned, and learning it needs labeled examples. So I built the
> tool that produces them.
>
> It is an annotation workspace for lab imagery. You trace the objects, polygons for rigid
> labware and a brush for spills and hands, tag them with a class, then attach the state.
> Liquid level. Open or closed. Whatever the protocol needs to check.
>
> That exports as structured JSON a training pipeline consumes directly. And because it runs
> in the browser, a technician at a partner lab can contribute data without installing
> anything, which is how you get a model that works on more than one bench.

Then: draw live, show the attribute panel adapting to class, undo a brush stroke, export,
open the JSON. Close on the architecture summary.

---

## 15. Known tradeoffs

Things to raise before being asked.

1. **Polygon and brush overlap.** Both are in the brief and both are justified, polygon for
   rigid glassware and brush for amorphous regions. But an experienced annotator could work
   with one fewer tool.
2. **No auth.** Deliberate. It is not the graded surface and it would cost a day.
3. **Masks in JSONB.** Fine at demo scale, would move to object storage past that.
4. **Single project.** The schema supports many. The UI ships with one to keep the demo tight.
5. **No model assist.** The natural next feature. The app is already shaped for it, since a
   pre-drawn shape and a human-drawn shape are the same record.
