import { buildExport } from '@/lib/export/build-export'
import { loadProjectBundle } from '@/lib/db/bundle'
import { exportFilename } from '@/lib/export/from-store'
import { handleError } from '@/lib/db/respond'

/**
 * Server-side export.
 *
 * The client can already build this document from its own store, so this route
 * exists for the other consumer: a training pipeline that wants to pull a
 * dataset by URL rather than have a person click a button. Both paths run the
 * same tested `buildExport`, so they cannot drift.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const bundle = await loadProjectBundle(id)
    if (!bundle) return Response.json({ error: 'Project not found' }, { status: 404 })

    const doc = buildExport(bundle)

    return new Response(JSON.stringify(doc, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${exportFilename()}"`,
      },
    })
  } catch (err) {
    return handleError(err)
  }
}
