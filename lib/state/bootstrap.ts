import { hydrateMaskBuffer } from '@/lib/canvas/mask-registry'
import { BUILT_IN_CLASSES } from '@/lib/classes'
import { SAMPLE_IMAGES } from '@/lib/samples'
import type { ProjectBundle } from '@/lib/db/bundle'
import { commandStack, useStore } from './store'
import { primeSync, startSync } from './sync'

const STORAGE_KEY = 'rookery.projectId'

/**
 * Load the workspace.
 *
 * ---------------------------------------------------------------------------
 * WHY THE PROJECT ID LIVES IN localStorage
 * ---------------------------------------------------------------------------
 * There is no authentication, so a single shared project would let any visitor
 * overwrite anyone else's annotations. Scoping a project to the browser gives
 * every visitor their own workspace with no login, and makes it impossible for
 * one person to clobber another mid-demo.
 *
 * The tradeoff is honest and worth stating: clear your site data and the
 * project becomes unreachable. Real accounts are the answer if this ever needs
 * to be shared between machines.
 *
 * ---------------------------------------------------------------------------
 * WHY FAILURE IS NOT FATAL
 * ---------------------------------------------------------------------------
 * If the API is unreachable or no database is configured, the app falls back to
 * seeded in-memory data and keeps working. Every tool, the class registry and
 * the export all function; the only thing lost is durability across a refresh.
 * A labeling tool that refuses to open because a database is missing is worse
 * than one that forgets.
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
