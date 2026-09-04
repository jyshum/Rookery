import type { Annotation, AttrValue, BBox, Geometry } from '@/lib/canvas/types'

/**
 * Conversion between in-memory shapes and their stored form.
 *
 * Polygon points live in memory as `Float32Array` because that is the right
 * representation for a render loop. JSON has no typed arrays, so the wire form
 * is a flat `number[]`. Flat rather than nested pairs: it is the storage
 * format, not the export format, and the two answer to different consumers.
 * Coupling them would mean a change to the published schema forcing a
 * migration.
 */

export type WireGeometry =
  | { kind: 'box'; x: number; y: number; w: number; h: number }
  | { kind: 'polygon'; points: number[] }
  | { kind: 'mask'; rle: number[]; width: number; height: number }

export interface WireAnnotation {
  id: string
  imageId: string
  classId: string
  geometry: WireGeometry
  bbox: BBox
  attributes: Record<string, AttrValue>
}

export function geometryToWire(g: Geometry): WireGeometry {
  if (g.kind === 'polygon') return { kind: 'polygon', points: Array.from(g.points) }
  return g
}

export function geometryFromWire(g: WireGeometry): Geometry {
  if (g.kind === 'polygon') return { kind: 'polygon', points: new Float32Array(g.points) }
  return g
}

export function annotationToWire(a: Annotation): WireAnnotation {
  return {
    id: a.id,
    imageId: a.imageId,
    classId: a.classId,
    geometry: geometryToWire(a.geometry),
    bbox: a.bbox,
    attributes: a.attributes,
  }
}

export function annotationFromWire(a: WireAnnotation): Annotation {
  return {
    id: a.id,
    imageId: a.imageId,
    classId: a.classId,
    geometry: geometryFromWire(a.geometry),
    bbox: a.bbox,
    attributes: a.attributes,
  }
}

/** Prisma's `AnnotationType` enum from the in-memory geometry tag. */
export function annotationTypeOf(g: Geometry): 'BOX' | 'POLYGON' | 'MASK' {
  if (g.kind === 'box') return 'BOX'
  if (g.kind === 'polygon') return 'POLYGON'
  return 'MASK'
}
