import type { AttributeDef, AttrValue, LabelClass } from '@/lib/canvas/types'

/**
 * Starter label classes.
 *
 * Chosen to cover the object kinds a bench camera actually sees, and to show
 * the two-level design: each class declares its own attribute schema, so
 * selecting a Reagent Bottle asks about liquid level while selecting a Gloved
 * Hand asks nothing. Users can add classes at runtime; these just mean the tool
 * is useful the moment it opens. See spec 7.
 */
export const BUILT_IN_CLASSES: LabelClass[] = [
  {
    id: 'cls_pipette_tip',
    key: 'pipette_tip',
    name: 'Pipette Tip',
    color: '#14B8A6',
    attributes: [
      { key: 'state', name: 'State', type: 'ENUM', options: ['Sealed', 'Used'], defaultValue: 'Sealed' },
    ],
  },
  {
    id: 'cls_reagent_bottle',
    key: 'reagent_bottle',
    name: 'Reagent Bottle',
    color: '#38BDF8',
    attributes: [
      { key: 'liquid_level', name: 'Liquid Level', type: 'PERCENT', defaultValue: 100 },
      { key: 'state', name: 'State', type: 'ENUM', options: ['Open', 'Closed'], defaultValue: 'Closed' },
    ],
  },
  {
    id: 'cls_tip_rack',
    key: 'tip_rack',
    name: 'Tip Rack',
    color: '#A78BFA',
    attributes: [
      { key: 'occupancy', name: 'Occupancy', type: 'PERCENT', defaultValue: 100 },
    ],
  },
  {
    id: 'cls_tray',
    key: 'tray',
    name: 'Tray',
    color: '#FBBF24',
    attributes: [
      { key: 'slot', name: 'Slot', type: 'NUMBER' },
    ],
  },
  {
    id: 'cls_gloved_hand',
    key: 'gloved_hand',
    name: 'Gloved Hand',
    color: '#F87171',
    attributes: [],
  },
  {
    id: 'cls_spill',
    key: 'spill',
    name: 'Spill',
    color: '#F472B6',
    attributes: [
      { key: 'hazard', name: 'Hazard', type: 'BOOLEAN', defaultValue: false },
    ],
  },
]

/**
 * Seed an annotation with its class's declared defaults, so a Reagent Bottle
 * arrives already saying "Closed, 100%" rather than blank. An unset attribute
 * and a deliberately-zero one are different facts, and the dataset should not
 * conflate them.
 */
export function defaultAttributes(defs: AttributeDef[]): Record<string, AttrValue> {
  const out: Record<string, AttrValue> = {}
  for (const d of defs) {
    if (d.defaultValue !== undefined) out[d.name] = d.defaultValue
  }
  return out
}
