import { prisma } from '@/lib/db/prisma'
import { handleError } from '@/lib/db/respond'
import { parseSyncBody } from '@/lib/db/validate'
import { annotationTypeOf, geometryFromWire } from '@/lib/db/wire'

/**
 * Batched write for one image.
 *
 * Annotation ids come from the client, so the server cannot tell whether a shape
 * is new. Upserting sidesteps that, and makes a retried request safe: a sync that
 * times out after committing can be sent again without creating duplicates.
 *
 * One transaction, so a dropped connection cannot leave half the shapes saved
 * while the client believes all of them landed.
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
