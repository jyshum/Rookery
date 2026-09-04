import type { Annotation, AttrValue, BBox, Geometry } from '@/lib/canvas/types'

/**
 * Converts between in-memory shapes and their stored form.
 *
 * Polygon points are a Float32Array in memory because that suits a render loop.
 * JSON has no typed arrays, so the stored form is a flat number array.
 *
 * The storage format is kept separate from the export format on purpose. They
 * answer to different consumers, and coupling them would mean a change to the
 * published schema forcing a migration.
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
