import type { AppState } from '@/lib/state/store'
import type { ExportInput } from './build-export'

/**
 * Local project identity.
 *
 * A placeholder until projects are persisted (Task 22), at which point this
 * comes from the database row rather than a constant.
 */
export const LOCAL_PROJECT = { id: 'prj_local', name: 'Lab Bench Dataset' }

/**
 * Flatten the normalized store into the shape the export builder wants.
 *
 * Kept separate from `downloadExport` so the mapping is testable without a DOM,
 * and so the same code can feed a server route later.
 *
 * Iterates the id arrays rather than `Object.values`, because those arrays
 * carry insertion order and the export should be stable between runs.
 */
export function exportInputFromState(s: AppState): ExportInput {
  return {
    project: LOCAL_PROJECT,
    classes: s.classIds.map((id) => s.classes[id]).filter((c) => c !== undefined),
    images: s.imageIds.map((id) => s.images[id]).filter((i) => i !== undefined),
    annotations: s.annotationIds.map((id) => s.annotations[id]).filter((a) => a !== undefined),
  }
}

export function exportFilename(now = new Date()): string {
  const date = now.toISOString().slice(0, 10)
  return `rookery-export-${date}.json`
}
