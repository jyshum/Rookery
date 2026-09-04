import { createSeededProject, loadProjectBundle } from '@/lib/db/bundle'
import { handleError } from '@/lib/db/respond'

/**
 * Create a project, seeded with the built-in classes and bundled photos.
 *
 * Projects are scoped per browser rather than per user. There is no auth, so
 * a single shared project would let any visitor overwrite anyone else's work.
 * The client keeps its project id in localStorage and creates one on first
 * visit. See docs/ARCHITECTURE.md section 8.
 */
export async function POST() {
  try {
    const { id } = await createSeededProject()
    const bundle = await loadProjectBundle(id)
    return Response.json(bundle, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
