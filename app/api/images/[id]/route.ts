import { prisma } from '@/lib/db/prisma'
import { handleError } from '@/lib/db/respond'
import { STORAGE_BUCKET, isStorageConfigured, supabaseAdmin } from '@/lib/db/supabase'

/**
 * Delete an image and everything annotated on it.
 *
 * Annotations are removed by the cascade on the foreign key, so this does not
 * delete them one at a time.
 *
 * An uploaded file is also removed from object storage. A failure there is
 * logged rather than raised: the row is already gone, so reporting an error
 * would leave the client thinking the delete failed when the only casualty is
 * an orphaned file.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params

    const image = await prisma.imageAsset.findUnique({
      where: { id },
      select: { id: true, url: true, source: true },
    })
    if (!image) return Response.json({ error: 'Image not found' }, { status: 404 })

    await prisma.imageAsset.delete({ where: { id } })

    if (image.source === 'UPLOADED' && isStorageConfigured()) {
      const marker = `/${STORAGE_BUCKET}/`
      const key = image.url.split(marker)[1]
      if (key) {
        const { error } = await supabaseAdmin().storage.from(STORAGE_BUCKET).remove([key])
        if (error) console.error('[api] storage cleanup failed:', error.message)
      }
    }

    return Response.json({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}
