import type { Annotation, AttrValue, Geometry, ImageAsset, LabelClass } from '@/lib/canvas/types'

/**
 * Builds the export document.
 *
 * The JSON is what this tool produces, so it is designed and tested rather than
 * serialized at the end of a route handler.
 *
 * A pure function with no database or request awareness, so the format can be
 * tested without a server and the same code serves a download or an API response.
 *
 * Classes are keyed by their stable key rather than a database id, and every
 * annotation carries a bbox even when it is a polygon or a mask, because training
 * pipelines expect one.
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
