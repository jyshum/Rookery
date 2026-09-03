/**
 * Run-length encoding for binary masks.
 *
 * A mask is mostly long stretches of "outside" and "inside", so storing run
 * lengths instead of per-pixel values shrinks it by orders of magnitude. This
 * is the same idea COCO uses, which keeps the export recognizable to anyone
 * who has consumed a segmentation dataset before. See spec 9.
 *
 * Format: alternating run lengths, row-major, always starting with a run of
 * zeros. A mask whose first pixel is filled therefore starts with a 0.
 */

export function encodeRLE(mask: Uint8Array): number[] {
  const runs: number[] = []
  if (mask.length === 0) return runs

  let current = 0 // 0 = empty run, 1 = filled run
  let count = 0

  for (let i = 0; i < mask.length; i++) {
    const v = mask[i] ? 1 : 0
    if (v === current) {
      count++
    } else {
      runs.push(count)
      current = v
      count = 1
    }
  }
  runs.push(count)

  return runs
}

export function decodeRLE(runs: number[], length: number): Uint8Array {
  const out = new Uint8Array(length)
  let pos = 0
  let value = 0

  for (const run of runs) {
    const end = Math.min(pos + run, length)
    if (value === 1) out.fill(1, pos, end)
    pos = end
    value = value === 0 ? 1 : 0
    if (pos >= length) break
  }

  return out
}
