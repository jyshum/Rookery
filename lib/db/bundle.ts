import { prisma } from './prisma'
import { annotationFromWire, type WireAnnotation } from './wire'
import type { Annotation, AttrType, AttrValue, ImageAsset, LabelClass } from '@/lib/canvas/types'
import { BUILT_IN_CLASSES } from '@/lib/classes'
import { SAMPLE_IMAGES } from '@/lib/samples'

/**
 * Everything the workspace needs for one project, in a single round trip.
 *
 * The client opens on a full picture rather than waterfalling four requests,
 * because until classes and images have loaded there is nothing to draw on and
 * nothing to draw as.
 */
export interface ProjectBundle {
  project: { id: string; name: string }
  images: ImageAsset[]
  classes: LabelClass[]
  annotations: Annotation[]
}

/** Create a project seeded with the built-in classes and bundled photos. */
export async function createSeededProject(name = 'Lab Bench Dataset') {
  return prisma.project.create({
    data: {
      name,
      classes: {
        create: BUILT_IN_CLASSES.map((c, order) => ({
          key: c.key,
          name: c.name,
          color: c.color,
          isBuiltIn: true,
          order,
          attributes: {
            create: c.attributes.map((a, i) => ({
              key: a.key,
              name: a.name,
              type: a.type,
              options: a.options ?? undefined,
              defaultValue: a.defaultValue ?? undefined,
              order: i,
            })),
          },
        })),
      },
      images: {
        create: SAMPLE_IMAGES.map((i, order) => ({
          filename: i.filename,
          source: 'BUNDLED' as const,
          url: i.url,
          width: i.width,
          height: i.height,
          order,
        })),
      },
    },
    select: { id: true },
  })
}

export async function loadProjectBundle(projectId: string): Promise<ProjectBundle | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      images: {
        orderBy: { order: 'asc' },
        include: { annotations: { orderBy: { createdAt: 'asc' } } },
      },
      classes: {
        orderBy: { order: 'asc' },
        include: { attributes: { orderBy: { order: 'asc' } } },
      },
    },
  })

  if (!project) return null

  const annotations: Annotation[] = project.images.flatMap((img) =>
    img.annotations.map((a) =>
      annotationFromWire({
        id: a.id,
        imageId: a.imageId,
        classId: a.labelClassId,
        geometry: a.geometry as WireAnnotation['geometry'],
        bbox: a.bbox as WireAnnotation['bbox'],
        attributes: a.attributes as Record<string, AttrValue>,
      }),
    ),
  )

  return {
    project: { id: project.id, name: project.name },
    images: project.images.map((i) => ({
      id: i.id,
      filename: i.filename,
      source: i.source,
      url: i.url,
      width: i.width,
      height: i.height,
    })),
    classes: project.classes.map((c) => ({
      id: c.id,
      key: c.key,
      name: c.name,
      color: c.color,
      attributes: c.attributes.map((a) => ({
        key: a.key,
        name: a.name,
        type: a.type as AttrType,
        options: (a.options as string[] | null) ?? undefined,
        defaultValue: (a.defaultValue as AttrValue | null) ?? undefined,
      })),
    })),
    annotations,
  }
}
