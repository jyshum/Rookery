import { hydrateMaskBuffer } from '@/lib/canvas/mask-registry'
import { BUILT_IN_CLASSES } from '@/lib/classes'
import { SAMPLE_IMAGES } from '@/lib/samples'
import type { ProjectBundle } from '@/lib/db/bundle'
import { commandStack, useStore } from './store'
import { primeSync, startSync } from './sync'

const STORAGE_KEY = 'rookery.projectId'

/**
 * Loads the workspace on startup.
 *
 * Each browser gets its own project, with the id kept in localStorage. There is
 * no login, so a single shared project would let any visitor overwrite someone
 * else's work. Clearing site data loses the project; accounts would be the fix if
 * a dataset ever needs to be shared between machines.
 *
 * If the API is unreachable the app falls back to seeded in-memory data and keeps
 * working. Only durability is lost. A labeling tool that refuses to open because
 * a database is missing is worse than one that forgets.
 */
export async function bootstrap(): Promise<void> {
  const stored = readStoredId()

  try {
    const bundle = stored ? await fetchProject(stored) : null
    const resolved = bundle ?? (await createProject())
    applyBundle(resolved)
    writeStoredId(resolved.project.id)
    startSync()
  } catch (err) {
    console.warn('[bootstrap] running without persistence:', err)
    applyLocalFallback()
  }
}

async function fetchProject(id: string): Promise<ProjectBundle | null> {
  const res = await fetch(`/api/projects/${id}`)
  // a stored id can outlive the database it came from; that is not an error
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GET /api/projects/${id} -> ${res.status}`)
  return res.json()
}

async function createProject(): Promise<ProjectBundle> {
  const res = await fetch('/api/projects', { method: 'POST' })
  if (!res.ok) throw new Error(`POST /api/projects -> ${res.status}`)
  return res.json()
}

function applyBundle(bundle: ProjectBundle): void {
  const s = useStore.getState()
  s.setProjectId(bundle.project.id)
  s.setStorageEnabled(Boolean(bundle.storageEnabled))
  s.hydrate(bundle)

  // masks arrive as run-length encoding; rebuild their working bitmaps so the
  // mask layer has pixels to draw
  for (const a of bundle.annotations) {
    if (a.geometry.kind === 'mask') hydrateMaskBuffer(a)
  }

  // undo history is per session: it must not offer to undo work that was
  // loaded rather than done here
  commandStack.clear()
  primeSync(bundle.annotations, bundle.classes)
  s.setSaveStatus('saved')
}

function applyLocalFallback(): void {
  const s = useStore.getState()
  s.setProjectId(null)
  s.setStorageEnabled(false)
  s.hydrate({ images: SAMPLE_IMAGES, classes: BUILT_IN_CLASSES, annotations: [] })
  commandStack.clear()
  s.setSaveStatus('offline')
}

function readStoredId(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    // private browsing and blocked site data both throw here
    return null
  }
}

function writeStoredId(id: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // non-fatal: the session works, it just will not be recoverable on reload
  }
}
