import { loadProjectBundle } from '@/lib/db/bundle'
import { handleError } from '@/lib/db/respond'

/**
 * Everything the workspace needs, in one round trip: images, classes with
 * their attribute schemas, and every annotation.
 *
 * A 404 here is expected rather than exceptional: the client may hold a
 * project id from a database that has since been reset. It treats 404 as
 * "create a fresh project" instead of an error.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const bundle = await loadProjectBundle(id)

    if (!bundle) return Response.json({ error: 'Project not found' }, { status: 404 })
    return Response.json(bundle)
  } catch (err) {
    return handleError(err)
  }
}
