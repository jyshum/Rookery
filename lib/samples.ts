import type { ImageAsset } from '@/lib/canvas/types'

/**
 * Bundled sample photographs.
 *
 * These ship inside the repo rather than in object storage so the app has
 * something on the canvas the moment it opens, and so a demo does not depend on
 * a network round trip. Uploaded images live in Supabase Storage instead; the
 * `source` field is what distinguishes them.
 *
 * Dimensions are recorded here rather than measured at runtime because the
 * export needs them and the database seed needs them, and both should agree
 * without decoding an image to find out.
 */
export const SAMPLE_IMAGES: ImageAsset[] = [
  {
    id: 'img_bench_01',
    filename: 'bench_01.jpg',
    source: 'BUNDLED',
    url: '/samples/bench_01.jpg',
    width: 1600,
    height: 1067,
  },
  {
    id: 'img_bench_02',
    filename: 'bench_02.jpg',
    source: 'BUNDLED',
    url: '/samples/bench_02.jpg',
    width: 1600,
    height: 1067,
  },
  {
    id: 'img_bench_03',
    filename: 'bench_03.jpg',
    source: 'BUNDLED',
    url: '/samples/bench_03.jpg',
    width: 1600,
    height: 1067,
  },
  {
    id: 'img_bench_04',
    filename: 'bench_04.jpg',
    source: 'BUNDLED',
    url: '/samples/bench_04.jpg',
    width: 1600,
    height: 1067,
  },
]
