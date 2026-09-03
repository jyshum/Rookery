# Rookery

Browser-based image annotation for computer vision and dataset preparation,
built for lab imagery.

Open a photo of a lab bench, trace the objects in it, tag each one with a class,
record its state, and export a structured JSON dataset a training pipeline can
consume.

Built as a take-home for **Corvinus Labs**.

---

## Why it exists

Corvinus builds a robot that takes a natural-language protocol and executes it on
a real bench. To do that it has to read the bench — not just "there is a bottle
there", but "that bottle is open and half full, so I can draw from it".

That reading is learned from labeled examples. This tool produces them.

The per-instance attributes are the point. `Liquid Level: 50%` and `State: Open`
are preconditions: "draw 200µL from reagent A" is only executable if A is open
and has volume. Geometry tells the robot where not to collide; attributes tell it
what it is allowed to do next.

---

## Features

**Canvas tools**

| Tool | Key | Use for |
|---|---|---|
| Select | `V` | Click to select, drag to move |
| Box | `B` | Coarse localization, one drag |
| Polygon | `P` | Rigid labware — trays, racks, bottles |
| Brush | `D` | Amorphous regions — spills, liquid, gloved hands |
| Erase | `E` | Fix overpaint, cut out occluding objects |

**Labels and attributes**

- Six built-in lab classes, each with its own attribute schema
- Create new classes at runtime, with attributes of type
  `text`, `number`, `percent`, `enum`, or `boolean`
- The attribute panel is schema-driven: it has no knowledge of any specific
  attribute and adapts to user-defined classes with no code change

**Export**

- Structured JSON: coordinates, labels, and per-instance metadata
- On-screen preview with copy, plus file download
- Masks encode as run-length; a 1600×1067 mask compresses to ~145 integers

**Everything is undoable** — shapes, moves, brush strokes, attribute edits, class
changes.

---

## Keyboard

```
V B P D E     select · box · polygon · brush · erase
1-9           pick a class (or reassign the selected shape)
[ ]           brush size
space + drag  pan
F or 0        fit image to view
Cmd/Ctrl+Z    undo          Cmd/Ctrl+Shift+Z   redo
Enter         close polygon        Backspace   remove last vertex
Delete        delete selected      Escape      cancel / close
```

---

## Running it

```bash
npm install
npm run dev
```

Open http://localhost:3000. Four lab bench photos are bundled, so there is
something to annotate immediately.

```bash
npm test              # 136 tests
npx tsc --noEmit      # typecheck
npx eslint .          # lint
```

No environment variables are needed. State is held in memory for the session; see
[Architecture §8](docs/ARCHITECTURE.md#8-what-is-not-built-and-why) for why
persistence is out of scope.

---

## Architecture

The full write-up is in **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**, covering
canvas performance and state handling in detail. The short version:

**Four stacked canvases, split by lifetime, not by tool.** Temporary things
(rubber band, cursor, hover) change every frame; permanent things (the photo,
committed shapes) almost never do. Sharing a canvas between them means paying the
permanent redraw cost at the temporary frequency. With 30 polygons on screen,
animating one rubber-band line on a shared canvas costs ~1,800 polygon redraws
per second. On its own layer it costs one path on an empty surface.

**Undo stores the action, not the result.** Deep-copying state per edit is fine
for boxes and fatal for masks — one 4K mask is ~33 MB. Each edit is a command
that knows how to invert itself; a brush stroke is a cursor path, not a bitmap.

**Undo is constant time.** Canvas painting is destructive, so undo has to replay.
Snapshotting the mask every 20 strokes caps replay at 20 regardless of session
length, for ~10 MB. Drawing never replays at all.

**React owns the chrome; an imperative loop owns the canvas.** They share a store,
not a render cycle.

---

## Layout

```
app/                 workspace page, theme tokens
components/
  canvas/            canvas mount, render loop, pointer routing
  panels/            toolbar, image rail, class panel, attribute panel, export drawer
lib/
  canvas/            geometry, transform, hit testing, RLE, mask buffer, renderer
    layers/          one draw function per layer
    tools/           one file per tool
  state/             normalized store, command stack, undoable edits
  export/            export builder, store mapping, JSON highlighter
docs/
  ARCHITECTURE.md    canvas performance and state handling
  specs/             design spec
public/samples/      bundled lab photos (Unsplash License, see CREDITS.md)
```

---

## Scope

`docs/ARCHITECTURE.md` §8 lists what is deliberately not built and why —
persistence, authentication, model-assisted pre-labeling, and COCO/YOLO export.
§9 lists known tradeoffs.
