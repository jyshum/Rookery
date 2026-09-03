import { defaultAttributes } from '@/lib/classes'
import { disposeMaskBuffer } from '@/lib/canvas/mask-registry'
import { dropMaskCache } from '@/lib/canvas/layers/mask-layer'
import type { AttrValue } from '@/lib/canvas/types'
import { commandStack, useStore } from './store'

/**
 * Undoable edits to an existing annotation.
 *
 * These live apart from the panels that trigger them so the panels stay
 * presentational, and so the "every edit is a command" rule has one place to be
 * enforced rather than being reimplemented per control.
 */

/**
 * Set one attribute value.
 *
 * Stores the previous value rather than a copy of the annotation, so undoing a
 * slider drag costs a number. Callers are expected to fire this once per
 * gesture, not once per input event, or the undo stack fills with a hundred
 * one-percent steps.
 */
export function setAttributeCommand(
  id: string,
  name: string,
  next: AttrValue,
  previous: AttrValue | undefined,
): void {
  if (next === previous) return

  commandStack.execute({
    label: `Set ${name}`,
    do: () => useStore.getState().setAttribute(id, name, next),
    undo: () => {
      const s = useStore.getState()
      if (previous === undefined) {
        const current = s.annotations[id]
        if (!current) return
        const rest = { ...current.attributes }
        delete rest[name]
        s.updateAnnotation(id, { attributes: rest })
      } else {
        s.setAttribute(id, name, previous)
      }
    },
  })
}

/**
 * Reassign an annotation to a different class.
 *
 * Attributes are replaced with the new class's defaults rather than carried
 * over. A Reagent Bottle's "Liquid Level" is meaningless on a Gloved Hand, and
 * leaving it behind would put keys in the export that the class schema does not
 * declare. The old values are kept for undo.
 */
export function changeClassCommand(id: string, classId: string): void {
  const s = useStore.getState()
  const annotation = s.annotations[id]
  if (!annotation || annotation.classId === classId) return

  const previousClassId = annotation.classId
  const previousAttributes = annotation.attributes
  const nextAttributes = defaultAttributes(s.classes[classId]?.attributes ?? [])

  commandStack.execute({
    label: 'Change class',
    do: () =>
      useStore.getState().updateAnnotation(id, { classId, attributes: nextAttributes }),
    undo: () =>
      useStore.getState().updateAnnotation(id, {
        classId: previousClassId,
        attributes: previousAttributes,
      }),
  })
}

/** Delete an annotation, keeping enough to put it back. */
export function deleteAnnotationCommand(id: string): void {
  const annotation = useStore.getState().annotations[id]
  if (!annotation) return

  commandStack.execute({
    label: 'Delete annotation',
    do: () => useStore.getState().removeAnnotation(id),
    undo: () => useStore.getState().addAnnotation(annotation),
  })
}

/**
 * Drop the render-side state for an annotation that is gone for good.
 *
 * Not called on undo-able deletion: an undone delete has to be able to redraw
 * its pixels. Reserved for teardown, such as switching projects.
 */
export function forgetAnnotationResources(id: string): void {
  disposeMaskBuffer(id)
  dropMaskCache(id)
}
