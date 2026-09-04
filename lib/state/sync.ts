import type { Annotation, LabelClass } from '@/lib/canvas/types'
import { annotationToWire } from '@/lib/db/wire'
import { useStore, type AppState } from './store'

/** Idle time before a burst of edits is flushed, in milliseconds. */
const DEBOUNCE_MS = 800

/**
 * Saves annotations to the server in the background.
 *
 * Drawing writes to the store and returns. Nothing waits on the network, so the
 * canvas keeps up even with no connection.
 *
 * Changes are flushed after 800ms of idle, batched into one request per image. A
 * brush stroke produces dozens of store updates a second and each one does not
 * need its own request.
 *
 * If no project was ever created, because there is no database configured, sync
 * turns itself off and the app runs in memory.
 */

/** Annotations as last confirmed by the server, for diffing. */
let lastSynced = new Map<string, Annotation>()
let pendingUpserts = new Set<string>()
let pendingDeletes = new Set<string>()
/** Classes as last confirmed by the server, so edits can be detected. */
let syncedClasses = new Map<string, LabelClass>()
let pendingClassIds = new Set<string>()

let timer: ReturnType<typeof setTimeout> | null = null
let inFlight = false
let unsubscribe: (() => void) | null = null
let enabled = false

/** Seed the diff baseline from what the server just gave us. */
export function primeSync(annotations: Annotation[], classes: LabelClass[]): void {
  lastSynced = new Map(annotations.map((a) => [a.id, a]))
  syncedClasses = new Map(classes.map((c) => [c.id, c]))
  pendingUpserts.clear()
  pendingDeletes.clear()
  pendingClassIds.clear()
}

export function startSync(): () => void {
  if (unsubscribe) return unsubscribe
  enabled = true

  unsubscribe = useStore.subscribe((s) => {
    if (!enabled || !s.projectId) return
    collect(s)
  })

  const onHide = () => {
    if (document.visibilityState === 'hidden') void flush()
  }
  document.addEventListener('visibilitychange', onHide)

  const stop = () => {
    enabled = false
    unsubscribe?.()
    unsubscribe = null
    document.removeEventListener('visibilitychange', onHide)
    if (timer) clearTimeout(timer)
    timer = null
  }
  return stop
}

export function stopSync(): void {
  enabled = false
  unsubscribe?.()
  unsubscribe = null
}

/** Diff the store against the last confirmed state and schedule a flush. */
function collect(s: AppState): void {
  let changed = false

  for (const id of s.annotationIds) {
    const current = s.annotations[id]
    // identity comparison is sufficient: the store replaces objects on edit
    if (current && lastSynced.get(id) !== current) {
      pendingUpserts.add(id)
      changed = true
    }
  }

  for (const id of lastSynced.keys()) {
    if (!s.annotations[id]) {
      pendingDeletes.add(id)
      pendingUpserts.delete(id)
      changed = true
    }
  }

  for (const id of s.classIds) {
    const current = s.classes[id]
    if (current && syncedClasses.get(id) !== current) {
      pendingClassIds.add(id)
      changed = true
    }
  }

  if (changed) schedule()
}

function schedule(): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void flush(), DEBOUNCE_MS)
}

export async function flush(): Promise<void> {
  if (inFlight) {
    // a flush is already running; re-arm so this round is not lost
    schedule()
    return
  }

  const s = useStore.getState()
  const projectId = s.projectId
  if (!enabled || !projectId) return

  const upsertIds = [...pendingUpserts]
  const deleteIds = [...pendingDeletes]
  const classIds = [...pendingClassIds]

  if (upsertIds.length === 0 && deleteIds.length === 0 && classIds.length === 0) return

  inFlight = true
  s.setSaveStatus('saving')

  try {
    // classes first: an annotation referencing an unsaved class breaks the
    // foreign key, so this order is required
    for (const id of classIds) {
      const cls = useStore.getState().classes[id]
      if (!cls) continue
      // one endpoint for both cases, since the server upserts
      const res = await fetch(`/api/projects/${projectId}/classes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cls),
      })
      if (!res.ok) throw new Error(`class sync failed: ${res.status}`)
      syncedClasses.set(id, cls)
      pendingClassIds.delete(id)
    }

    const byImage = new Map<string, { upserts: Annotation[]; deletes: string[] }>()

    for (const id of upsertIds) {
      const a = s.annotations[id]
      if (!a) continue
      const entry = byImage.get(a.imageId) ?? { upserts: [], deletes: [] }
      entry.upserts.push(a)
      byImage.set(a.imageId, entry)
    }

    for (const id of deleteIds) {
      const imageId = lastSynced.get(id)?.imageId
      if (!imageId) continue
      const entry = byImage.get(imageId) ?? { upserts: [], deletes: [] }
      entry.deletes.push(id)
      byImage.set(imageId, entry)
    }

    for (const [imageId, batch] of byImage) {
      const res = await fetch(`/api/images/${imageId}/annotations/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          upserts: batch.upserts.map(annotationToWire),
          deletes: batch.deletes,
        }),
      })
      if (!res.ok) throw new Error(`annotation sync failed: ${res.status}`)
    }

    // only clear what we actually sent; edits made mid-flight stay pending
    for (const id of upsertIds) {
      pendingUpserts.delete(id)
      const a = useStore.getState().annotations[id]
      if (a) lastSynced.set(id, a)
    }
    for (const id of deleteIds) {
      pendingDeletes.delete(id)
      lastSynced.delete(id)
    }

    useStore.getState().setSaveStatus('saved')
  } catch (err) {
    console.error('[sync]', err)
    useStore.getState().setSaveStatus('error')
    // leave the pending sets intact so the next edit retries them
  } finally {
    inFlight = false
  }
}

/** Test seam. */
export function __resetSyncState(): void {
  lastSynced = new Map()
  pendingUpserts = new Set()
  pendingDeletes = new Set()
  syncedClasses = new Map()
  pendingClassIds = new Set()
  if (timer) clearTimeout(timer)
  timer = null
  inFlight = false
  enabled = false
  unsubscribe?.()
  unsubscribe = null
}
