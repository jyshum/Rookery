import { describe, it, expect } from 'vitest'
import { MaskBuffer, type Stroke } from './mask-buffer'
import { encodeRLE } from './rle'

/**
 * How much smaller RLE makes a mask in the export.
 *
 * Masks are painted with the real MaskBuffer at the bundled photo size, so the
 * numbers match what a brush annotation on a sample image actually exports.
 *
 * The baseline is the raw mask written into JSON the naive way: one 0 or 1 per
 * pixel. Binary (one byte per pixel) is listed too, as the best a raw format
 * could do without any encoding.
 */

const W = 1600
const H = 1067

function path(...xy: number[]): Float32Array {
  return new Float32Array(xy)
}

function paint(strokes: Stroke[]): MaskBuffer {
  const b = new MaskBuffer(W, H)
  for (const s of strokes) b.apply(s)
  return b
}

const MASKS: Record<string, MaskBuffer> = {
  // a small spill: overlapping scribbles in one area
  spill: paint([
    { points: path(700, 800, 760, 790, 820, 810, 860, 840), radius: 22, mode: 'paint' },
    { points: path(690, 830, 750, 850, 810, 860, 870, 850), radius: 22, mode: 'paint' },
    { points: path(720, 870, 780, 880, 840, 875), radius: 18, mode: 'paint' },
  ]),

  // a gloved hand reaching in from the edge: long, thick strokes
  hand: paint([
    { points: path(1599, 300, 1450, 340, 1320, 390, 1240, 430), radius: 45, mode: 'paint' },
    { points: path(1599, 380, 1460, 410, 1330, 450, 1250, 480), radius: 45, mode: 'paint' },
    { points: path(1250, 430, 1190, 400, 1150, 380), radius: 14, mode: 'paint' },
    { points: path(1250, 460, 1180, 450, 1130, 445), radius: 14, mode: 'paint' },
  ]),

  // liquid in a tube: a thin vertical fill
  liquid: paint([{ points: path(400, 500, 400, 700), radius: 8, mode: 'paint' }]),
}

describe('RLE export size', () => {
  const rows = Object.entries(MASKS).map(([name, mask]) => {
    const rle = encodeRLE(mask.data)
    const rawJson = JSON.stringify(Array.from(mask.data)).length
    const rleJson = JSON.stringify({ rle, width: W, height: H }).length

    return {
      mask: name,
      pixels: mask.data.length,
      rleValues: rle.length,
      rawJsonBytes: rawJson,
      rawBinaryBytes: mask.data.length,
      rleJsonBytes: rleJson,
      reductionVsJson: `${((1 - rleJson / rawJson) * 100).toFixed(3)}%`,
      reductionVsBinary: `${((1 - rleJson / mask.data.length) * 100).toFixed(3)}%`,
      timesSmaller: Math.round(rawJson / rleJson),
    }
  })

  it('reports the size of each sample mask both ways', () => {
    console.table(rows)
    expect(rows).toHaveLength(3)
  })

  it('cuts every sample mask by more than 99% against raw JSON', () => {
    for (const r of rows) {
      expect(r.rleJsonBytes / r.rawJsonBytes).toBeLessThan(0.01)
    }
  })

  it('stays smaller than even a one-byte-per-pixel binary mask', () => {
    for (const r of rows) {
      expect(r.rleJsonBytes).toBeLessThan(r.rawBinaryBytes / 100)
    }
  })
})
