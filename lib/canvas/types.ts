/**
 * Shared types for annotation geometry and labels.
 *
 * Point data is stored as flat Float32Array (`[x, y, x, y, ...]`) rather than
 * arrays of `{x, y}` objects. One contiguous block instead of thousands of
 * tracked objects: smaller, faster to iterate, and no garbage-collection pauses
 * in the middle of a brush stroke.
 */

export type Point = { x: number; y: number }

/** `[x, y, width, height]` in image space. */
export type BBox = [x: number, y: number, w: number, h: number]

export type AttrType = 'NUMBER' | 'PERCENT' | 'ENUM' | 'BOOLEAN' | 'TEXT'

export type AttrValue = string | number | boolean

/** Declares a question a class asks about every instance of itself. */
export interface AttributeDef {
  key: string
  name: string
  type: AttrType
  /** Required when `type` is `ENUM`, ignored otherwise. */
  options?: string[]
  defaultValue?: AttrValue
}

/**
 * A class defines *which* questions get asked. An Annotation holds the answers.
 * That split is what lets a user invent a class at runtime and have the
 * attribute panel adapt with no code change.
 */
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
  /** Always present, even for polygons and masks. Training pipelines expect one. */
  bbox: BBox
  attributes: Record<string, AttrValue>
}

export interface ImageAsset {
  id: string
  filename: string
  source: 'BUNDLED' | 'UPLOADED'
  url: string
  width: number
  height: number
}

/** Maps image space to screen space: `screen = image * scale + t`. */
export interface Viewport {
  scale: number
  tx: number
  ty: number
}

export type ToolId = 'select' | 'box' | 'polygon' | 'brush' | 'erase'
