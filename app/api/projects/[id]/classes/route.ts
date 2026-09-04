import { prisma } from '@/lib/db/prisma'
import { handleError } from '@/lib/db/respond'
import { BadRequest } from '@/lib/db/validate'
import type { AttrType } from '@/lib/canvas/types'

const ATTR_TYPES: AttrType[] = ['NUMBER', 'PERCENT', 'ENUM', 'BOOLEAN', 'TEXT']

interface IncomingAttribute {
  key: string
  name: string
  type: AttrType
  options?: string[]
  defaultValue?: unknown
}

/**
 * Create or update a label class and its attribute schema.
 *
 * Upserts, so the client does not have to track whether a class has been saved
 * before. Class ids come from the client for the same reason annotation ids do:
 * a user can invent a class and draw with it immediately.
 *
 * Attributes are replaced wholesale rather than diffed. A schema is small, and
 * merging edits field by field would need stable per-attribute ids that add
 * nothing here.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: projectId } = await ctx.params
    const body = await req.json()

    if (!body || typeof body.id !== 'string' || typeof body.name !== 'string') {
      throw new BadRequest('id and name are required')
    }
    if (typeof body.key !== 'string' || !body.key) throw new BadRequest('key is required')
    if (typeof body.color !== 'string') throw new BadRequest('color is required')

    const attributes: IncomingAttribute[] = Array.isArray(body.attributes) ? body.attributes : []
    for (const a of attributes) {
      if (typeof a?.name !== 'string' || typeof a?.key !== 'string') {
        throw new BadRequest('each attribute needs a key and a name')
      }
      if (!ATTR_TYPES.includes(a.type)) {
        throw new BadRequest(`attribute type must be one of ${ATTR_TYPES.join(', ')}`)
      }
    }

    const attributeRows = attributes.map((a, i) => ({
      key: a.key,
      name: a.name,
      type: a.type,
      options: a.options ?? undefined,
      defaultValue: (a.defaultValue ?? undefined) as never,
      order: i,
    }))

    const existing = await prisma.labelClass.findUnique({
      where: { id: body.id },
      select: { id: true, order: true },
    })

    const order = existing?.order ?? (await prisma.labelClass.count({ where: { projectId } }))

    const saved = await prisma.labelClass.upsert({
      where: { id: body.id },
      create: {
        id: body.id,
        projectId,
        key: body.key,
        name: body.name,
        color: body.color,
        isBuiltIn: Boolean(body.isBuiltIn),
        order,
        attributes: { create: attributeRows },
      },
      update: {
        key: body.key,
        name: body.name,
        color: body.color,
        // replace the schema rather than merge it
        attributes: { deleteMany: {}, create: attributeRows },
      },
      select: { id: true },
    })

    return Response.json(saved, { status: existing ? 200 : 201 })
  } catch (err) {
    return handleError(err)
  }
}

/** Delete a class. Refused while annotations still reference it. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await ctx.params
    const classId = new URL(req.url).searchParams.get('classId')
    if (!classId) throw new BadRequest('classId is required')

    const inUse = await prisma.annotation.count({ where: { labelClassId: classId } })
    if (inUse > 0) {
      return Response.json(
        { error: `${inUse} annotation(s) still use this class` },
        { status: 409 },
      )
    }

    await prisma.labelClass.delete({ where: { id: classId } })
    return Response.json({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}
