import { create } from 'zustand'
import type {
  Annotation,
  AttrValue,
  ImageAsset,
  LabelClass,
  ToolId,
  Viewport,
} from '@/lib/canvas/types'
import { CommandStack } from './commands'

/**
 * Application state.
 *
 * Annotations are keyed by id in a flat record, so editing one replaces one entry
 * and only its readers re-render.
 *
 * The canvas subscribes to this store directly and repaints itself instead of
 * re-rendering. A pointer move that triggered a React render would already have
 * missed the frame. React renders the panels; an imperative loop drives the canvas.
 */

export interface AppState {
  // images
  images: Record<string, ImageAsset>
  imageIds: string[]
  activeImageId: string | null

  // annotations
  annotations: Record<string, Annotation>
  annotationIds: string[]
  selectedId: string | null

  // label classes
  classes: Record<string, LabelClass>
  classIds: string[]
  activeClassId: string | null

  // ui
  tool: ToolId
  viewport: Viewport
  brushSize: number
  saveStatus: 'idle' | 'saving' | 'saved' | 'error' | 'offline'
  exportOpen: boolean
  projectId: string | null

  // actions
  addAnnotation: (a: Annotation) => void
  removeAnnotation: (id: string) => void
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void
  setAttribute: (id: string, name: string, value: AttrValue) => void
  setSelected: (id: string | null) => void

  setTool: (t: ToolId) => void
  setViewport: (v: Viewport) => void
  setBrushSize: (n: number) => void
  setSaveStatus: (s: AppState['saveStatus']) => void
  setExportOpen: (open: boolean) => void
  setProjectId: (id: string | null) => void

  setActiveImage: (id: string) => void
  setActiveClass: (id: string) => void
  addImage: (i: ImageAsset) => void
  addClass: (c: LabelClass) => void
  updateClass: (id: string, patch: Partial<Omit<LabelClass, 'id'>>) => void
  removeClass: (id: string) => void

  hydrate: (payload: {
    images: ImageAsset[]
    classes: LabelClass[]
    annotations: Annotation[]
  }) => void
}

/**
 * Single shared undo history. Commands mutate the store through its actions,
 * so the stack stays a thin record of intent rather than a second copy of state.
 */
export const commandStack = new CommandStack()

export const useStore = create<AppState>((set) => ({
  images: {},
  imageIds: [],
  activeImageId: null,

  annotations: {},
  annotationIds: [],
  selectedId: null,

  classes: {},
  classIds: [],
  activeClassId: null,

  tool: 'select',
  viewport: { scale: 1, tx: 0, ty: 0 },
  brushSize: 12,
  saveStatus: 'idle',
  exportOpen: false,
  projectId: null,

  addAnnotation: (a) =>
    set((s) => ({
      annotations: { ...s.annotations, [a.id]: a },
      annotationIds: [...s.annotationIds, a.id],
      selectedId: a.id,
    })),

  removeAnnotation: (id) =>
    set((s) => {
      const next = { ...s.annotations }
      delete next[id]
      return {
        annotations: next,
        annotationIds: s.annotationIds.filter((x) => x !== id),
        selectedId: s.selectedId === id ? null : s.selectedId,
      }
    }),

  updateAnnotation: (id, patch) =>
    set((s) => {
      const existing = s.annotations[id]
      if (!existing) return s
      return { annotations: { ...s.annotations, [id]: { ...existing, ...patch } } }
    }),

  setAttribute: (id, name, value) =>
    set((s) => {
      const existing = s.annotations[id]
      if (!existing) return s
      return {
        annotations: {
          ...s.annotations,
          [id]: { ...existing, attributes: { ...existing.attributes, [name]: value } },
        },
      }
    }),

  setSelected: (id) => set({ selectedId: id }),

  setTool: (t) => set({ tool: t }),
  setViewport: (v) => set({ viewport: v }),
  setBrushSize: (n) => set({ brushSize: Math.max(1, Math.min(200, n)) }),
  setSaveStatus: (s) => set({ saveStatus: s }),
  setExportOpen: (open) => set({ exportOpen: open }),
  setProjectId: (id) => set({ projectId: id }),

  // switching images clears the selection: an annotation on another photo
  // must never stay selected, or the attribute panel edits an invisible shape
  setActiveImage: (id) => set({ activeImageId: id, selectedId: null }),
  setActiveClass: (id) => set({ activeClassId: id }),

  addImage: (i) =>
    set((s) =>
      s.images[i.id]
        ? s
        : {
            images: { ...s.images, [i.id]: i },
            imageIds: [...s.imageIds, i.id],
            activeImageId: s.activeImageId ?? i.id,
          },
    ),

  addClass: (c) =>
    set((s) => ({
      classes: { ...s.classes, [c.id]: c },
      classIds: s.classIds.includes(c.id) ? s.classIds : [...s.classIds, c.id],
      activeClassId: s.activeClassId ?? c.id,
    })),

  updateClass: (id, patch) =>
    set((s) => {
      const existing = s.classes[id]
      if (!existing) return s
      return { classes: { ...s.classes, [id]: { ...existing, ...patch } } }
    }),

  // only safe when nothing references it; callers check first
  removeClass: (id) =>
    set((s) => {
      const next = { ...s.classes }
      delete next[id]
      const ids = s.classIds.filter((x) => x !== id)
      return {
        classes: next,
        classIds: ids,
        activeClassId: s.activeClassId === id ? (ids[0] ?? null) : s.activeClassId,
      }
    }),

  hydrate: ({ images, classes, annotations }) =>
    set({
      images: Object.fromEntries(images.map((i) => [i.id, i])),
      imageIds: images.map((i) => i.id),
      activeImageId: images[0]?.id ?? null,

      classes: Object.fromEntries(classes.map((c) => [c.id, c])),
      classIds: classes.map((c) => c.id),
      activeClassId: classes[0]?.id ?? null,

      annotations: Object.fromEntries(annotations.map((a) => [a.id, a])),
      annotationIds: annotations.map((a) => a.id),
      selectedId: null,
    }),
}))

// Selectors, so a component subscribes only to the slice it needs. Reading the
// whole store would re-render a panel every time the viewport changed.

export const selectActiveImage = (s: AppState): ImageAsset | null =>
  s.activeImageId ? (s.images[s.activeImageId] ?? null) : null

export const selectSelectedAnnotation = (s: AppState): Annotation | null =>
  s.selectedId ? (s.annotations[s.selectedId] ?? null) : null

export const selectActiveClass = (s: AppState): LabelClass | null =>
  s.activeClassId ? (s.classes[s.activeClassId] ?? null) : null

/** How many annotations use a class. Guards deletion. */
export const countAnnotationsForClass = (s: AppState, classId: string): number =>
  s.annotationIds.reduce((n, id) => (s.annotations[id]?.classId === classId ? n + 1 : n), 0)

/** Annotations belonging to the active image, in draw order. */
export const selectVisibleAnnotations = (s: AppState): Annotation[] => {
  if (!s.activeImageId) return []
  const out: Annotation[] = []
  for (const id of s.annotationIds) {
    const a = s.annotations[id]
    if (a && a.imageId === s.activeImageId) out.push(a)
  }
  return out
}
