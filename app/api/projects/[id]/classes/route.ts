import { prisma } from '@/lib/db/prisma'
import { handleError } from '@/lib/db/respond'
import { BadRequest } from '@/lib/db/validate'
import type { AttrType } from '@/lib/canvas/types'

const ATTR_TYPES: AttrType[] = ['NUMBER', 'PERCENT', 'ENUM', 'BOOLEAN', 'TEXT']

/**
 * Create a label class and its attribute schema.
 *
 * The class id is client-supplied for the same reason annotation ids are: the
 * user can create a class and immediately draw with it, without the UI waiting
 * on a round trip to learn what to call it.
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

    const attributes = Array.isArray(body.attributes) ? body.attributes : []
    for (const a of attributes) {
      if (typeof a?.name !== 'string' || typeof a?.key !== 'string') {
        throw new BadRequest('each attribute needs a key and a name')
      }
      if (!ATTR_TYPES.includes(a.type)) {
        throw new BadRequest(`attribute type must be one of ${ATTR_TYPES.join(', ')}`)
      }
    }

    const order = await prisma.labelClass.count({ where: { projectId } })

    const created = await prisma.labelClass.create({
      data: {
        id: body.id,
        projectId,
        key: body.key,
        name: body.name,
        color: body.color,
        isBuiltIn: false,
        order,
        attributes: {
          create: attributes.map(
            (a: { key: string; name: string; type: AttrType; options?: string[]; defaultValue?: unknown }, i: number) => ({
              key: a.key,
              name: a.name,
              type: a.type,
              options: a.options ?? undefined,
              defaultValue: a.defaultValue ?? undefined,
              order: i,
            }),
          ),
        },
      },
      select: { id: true },
    })

    return Response.json(created, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
