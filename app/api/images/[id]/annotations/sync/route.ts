import { prisma } from '@/lib/db/prisma'
import { handleError } from '@/lib/db/respond'
import { parseSyncBody } from '@/lib/db/validate'
import { annotationTypeOf, geometryFromWire } from '@/lib/db/wire'

/**
 * Batched write for one image.
 *
 * ---------------------------------------------------------------------------
 * WHY UPSERT RATHER THAN CREATE/UPDATE
 * ---------------------------------------------------------------------------
 * Annotation ids are generated on the client, so the server does not know
 * whether a given shape is new. Upserting makes that question irrelevant and
 * makes a retried request idempotent: a sync that times out after committing
 * can be safely re-sent instead of producing duplicates.
 *
 * ---------------------------------------------------------------------------
 * WHY ONE TRANSACTION
 * ---------------------------------------------------------------------------
 * A dropped connection midway would otherwise leave some shapes saved and
 * others not, with the client believing all of them landed. All or nothing.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: imageId } = await ctx.params
    const { upserts, deletes } = parseSyncBody(await req.json())

    await prisma.$transaction([
      ...upserts.map((a) => {
        const data = {
          type: annotationTypeOf(geometryFromWire(a.geometry)),
          geometry: a.geometry,
          bbox: a.bbox,
          attributes: a.attributes,
          labelClassId: a.classId,
        }
        return prisma.annotation.upsert({
          where: { id: a.id },
          create: { id: a.id, imageId, ...data },
          update: data,
        })
      }),
      prisma.annotation.deleteMany({ where: { id: { in: deletes }, imageId } }),
    ])

    return Response.json({ ok: true, written: upserts.length, deleted: deletes.length })
  } catch (err) {
    return handleError(err)
  }
}
