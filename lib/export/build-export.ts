import type { Annotation, AttrValue, Geometry, ImageAsset, LabelClass } from '@/lib/canvas/types'

/**
 * Builds the export document.
 *
 * The exported JSON is the actual product of this tool. Everything else exists
 * to produce it, so it is designed and tested rather than serialized ad hoc at
 * the end of a route handler.
 *
 * Deliberately a pure function with no database or request awareness. That
 * keeps the format under test without standing up a server, and it means the
 * same code path can serve a download or a local preview.
 *
 * Two decisions worth noting:
 *
 * 1. Classes are keyed by their stable `key` ("reagent_bottle"), not their
 *    database id. A consumer training a model should not have to care about our
 *    primary keys, and the key survives a reseed.
 *
 * 2. Every annotation carries a `bbox`, including polygons and masks. Detection
 *    pipelines expect one, and computing it here means no consumer has to
 *    reimplement bounding-box math over our geometry formats.
 *
 * See spec section 9.
 */

export interface ExportInput {
  project: { id: string; name: string }
  classes: LabelClass[]
  images: ImageAsset[]
  annotations: Annotation[]
}

interface ExportedAttribute {
  name: string
  type: string
  options?: string[]
}

interface ExportedAnnotation {
  id: string
  class: string
  type: Geometry['kind']
  geometry: Record<string, unknown>
  bbox: [number, number, number, number]
  attributes: Record<string, AttrValue>
}

export interface ExportDocument {
  schema_version: string
  exported_at: string
  project: { id: string; name: string }
  classes: Array<{
    id: string
    name: string
    color: string
    attributes: ExportedAttribute[]
  }>
  images: Array<{
    id: string
    file: string
    width: number
    height: number
    annotations: ExportedAnnotation[]
  }>
}

export function buildExport(input: ExportInput): ExportDocument {
  const classKeyById = new Map(input.classes.map((c) => [c.id, c.key]))

  // group once rather than filtering the annotation list per image
  const byImage = new Map<string, Annotation[]>()
  for (const a of input.annotations) {
    const list = byImage.get(a.imageId)
    if (list) list.push(a)
    else byImage.set(a.imageId, [a])
  }

  return {
    schema_version: '1.0',
    exported_at: new Date().toISOString(),
    project: input.project,

    classes: input.classes.map((c) => ({
      id: c.key,
      name: c.name,
      color: c.color,
      attributes: c.attributes.map((a) => {
        const out: ExportedAttribute = { name: a.name, type: a.type.toLowerCase() }
        if (a.options) out.options = a.options
        return out
      }),
    })),

    images: input.images.map((img) => ({
      id: img.id,
      file: img.filename,
      width: img.width,
      height: img.height,
      annotations: (byImage.get(img.id) ?? []).map((a) => ({
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

/**
 * Float32Array is the right in-memory representation but not the right wire
 * format, so polygon points are widened into nested pairs. JSON has no typed
 * arrays, and `[[x, y], ...]` is what every annotation format uses.
 */
function serializeGeometry(g: Geometry): Record<string, unknown> {
  if (g.kind === 'box') return { x: g.x, y: g.y, w: g.w, h: g.h }
  if (g.kind === 'mask') return { rle: g.rle, width: g.width, height: g.height }

  const points: number[][] = []
  for (let i = 0; i < g.points.length; i += 2) {
    points.push([g.points[i], g.points[i + 1]])
  }
  return { points }
}
