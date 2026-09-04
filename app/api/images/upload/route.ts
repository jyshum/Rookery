import { prisma } from '@/lib/db/prisma'
import { handleError } from '@/lib/db/respond'
import { BadRequest } from '@/lib/db/validate'
import { STORAGE_BUCKET, isStorageConfigured, supabaseAdmin } from '@/lib/db/supabase'

const MAX_BYTES = 20 * 1024 * 1024

/**
 * Upload an image and register it on a project.
 *
 * The file is proxied through this route rather than uploaded from the browser
 * directly, so the Supabase service role key never leaves the server.
 *
 * Dimensions are measured client-side and sent along. Reading them here would
 * mean a server-side image library for two numbers the browser already knows.
 */
export async function POST(req: Request) {
  try {
    if (!isStorageConfigured()) {
      return Response.json(
        { error: 'Image upload needs Supabase Storage. See .env.example.' },
        { status: 501 },
      )
    }

    const form = await req.formData()
    const file = form.get('file')
    const projectId = form.get('projectId')
    const width = Number(form.get('width'))
    const height = Number(form.get('height'))

    if (!(file instanceof File)) throw new BadRequest('file is required')
    if (typeof projectId !== 'string' || !projectId) throw new BadRequest('projectId is required')
    if (!file.type.startsWith('image/')) throw new BadRequest('file must be an image')
    if (file.size > MAX_BYTES) throw new BadRequest('image must be 20 MB or smaller')
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
      throw new BadRequest('width and height are required')
    }

    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const key = `${projectId}/${crypto.randomUUID()}.${extension}`

    const storage = supabaseAdmin().storage.from(STORAGE_BUCKET)
    const { error } = await storage.upload(key, file, {
      contentType: file.type,
      upsert: false,
    })
    if (error) throw new Error(`Storage upload failed: ${error.message}`)

    const { data } = storage.getPublicUrl(key)
    const order = await prisma.imageAsset.count({ where: { projectId } })

    const created = await prisma.imageAsset.create({
      data: {
        projectId,
        filename: file.name,
        source: 'UPLOADED',
        url: data.publicUrl,
        width,
        height,
        order,
      },
      select: { id: true, filename: true, source: true, url: true, width: true, height: true },
    })

    return Response.json(created, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
