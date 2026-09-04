import type { WireAnnotation, WireGeometry } from './wire'

/**
 * Minimal request validation.
 *
 * Hand-rolled rather than pulling in a schema library: the API surface is six
 * routes with small bodies, and the failure mode we actually care about is a
 * malformed geometry reaching the database as valid JSON. A library would be
 * the right call the moment this grows.
 */

export class BadRequest extends Error {}

function fail(message: string): never {
  throw new BadRequest(message)
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function numberArray(v: unknown, field: string): number[] {
  if (!Array.isArray(v) || v.some((n) => typeof n !== 'number' || !Number.isFinite(n))) {
    fail(`${field} must be an array of finite numbers`)
  }
  return v as number[]
}

export function parseGeometry(v: unknown): WireGeometry {
  if (!isRecord(v)) fail('geometry must be an object')

  switch (v.kind) {
    case 'box': {
      for (const k of ['x', 'y', 'w', 'h']) {
        if (typeof v[k] !== 'number' || !Number.isFinite(v[k])) fail(`geometry.${k} must be a number`)
      }
      return { kind: 'box', x: v.x as number, y: v.y as number, w: v.w as number, h: v.h as number }
    }
    case 'polygon': {
      const points = numberArray(v.points, 'geometry.points')
      if (points.length < 6 || points.length % 2 !== 0) {
        fail('geometry.points must hold at least 3 coordinate pairs')
      }
      return { kind: 'polygon', points }
    }
    case 'mask': {
      const rle = numberArray(v.rle, 'geometry.rle')
      if (typeof v.width !== 'number' || typeof v.height !== 'number') {
        fail('geometry.width and geometry.height must be numbers')
      }
      return { kind: 'mask', rle, width: v.width, height: v.height }
    }
    default:
      fail('geometry.kind must be box, polygon, or mask')
  }
}

export function parseAnnotation(v: unknown): WireAnnotation {
  if (!isRecord(v)) fail('annotation must be an object')
  if (typeof v.id !== 'string' || !v.id) fail('annotation.id is required')
  if (typeof v.classId !== 'string' || !v.classId) fail('annotation.classId is required')

  const bbox = numberArray(v.bbox, 'annotation.bbox')
  if (bbox.length !== 4) fail('annotation.bbox must hold exactly four numbers')

  if (v.attributes !== undefined && !isRecord(v.attributes)) {
    fail('annotation.attributes must be an object')
  }

  return {
    id: v.id,
    imageId: typeof v.imageId === 'string' ? v.imageId : '',
    classId: v.classId,
    geometry: parseGeometry(v.geometry),
    bbox: bbox as WireAnnotation['bbox'],
    attributes: (v.attributes ?? {}) as WireAnnotation['attributes'],
  }
}

export function parseSyncBody(v: unknown): { upserts: WireAnnotation[]; deletes: string[] } {
  if (!isRecord(v)) fail('body must be an object')

  const rawUpserts = v.upserts ?? []
  const rawDeletes = v.deletes ?? []

  if (!Array.isArray(rawUpserts)) fail('upserts must be an array')
  if (!Array.isArray(rawDeletes) || rawDeletes.some((d) => typeof d !== 'string')) {
    fail('deletes must be an array of ids')
  }

  return {
    upserts: rawUpserts.map(parseAnnotation),
    deletes: rawDeletes as string[],
  }
}
