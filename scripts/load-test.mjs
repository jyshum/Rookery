/**
 * Load test for the API routes.
 *
 * Simulates annotators working at the same time. Each virtual user creates its
 * own project, as a real browser does, then loops the way the client behaves:
 * a batched sync of new shapes, an occasional edit re-sent with the same ids,
 * a project reload, and now and then a full export.
 *
 * Afterwards it counts rows in Postgres and compares them with the saves the
 * server confirmed. Fewer rows means a confirmed write was lost. More means a
 * failed batch left part of itself behind instead of rolling back.
 *
 * Local:
 *   BASE_URL=http://localhost:3000 DATABASE_URL=postgresql://localhost/rookery_load \
 *     node scripts/load-test.mjs
 *
 * Production needs ALLOW_PRODUCTION=1, and DATABASE_URL must be the database the
 * deploy writes to. Every project the run creates is deleted at the end, which
 * cascades to its images and annotations. Nothing else is touched. The run also
 * stops early if the database grows past MAX_DB_MB.
 */

import pg from 'pg'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const LEVELS = (process.env.LEVELS ?? '10,50,100').split(',').map(Number)
const SECONDS = Number(process.env.SECONDS ?? 20)
const SHAPES_PER_SYNC = 5
const MAX_DB_MB = Number(process.env.MAX_DB_MB ?? 300)

const LOCAL = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? '')
if (!LOCAL && process.env.ALLOW_PRODUCTION !== '1') {
  console.error('DATABASE_URL is not local. Set ALLOW_PRODUCTION=1 to run against it.')
  process.exit(1)
}

/** Every project this run creates, so cleanup can remove exactly those. */
const created = []

// a brush mask the size of a real one: 617 runs, same as the gloved hand sample
const MASK_RLE = Array.from({ length: 617 }, (_, i) => (i % 2 ? 40 + (i % 7) : 2700 + i))

function shape(i) {
  const kind = i % 3
  if (kind === 0) return { kind: 'box', x: 10 + i, y: 20, w: 90, h: 120 }
  if (kind === 1) return { kind: 'polygon', points: [10, 10, 200, 15, 210, 180, 30, 190, 5, 90] }
  return { kind: 'mask', rle: MASK_RLE, width: 1600, height: 1067 }
}

const stats = new Map()

function record(route, ms, ok) {
  const s = stats.get(route) ?? { times: [], errors: 0 }
  s.times.push(ms)
  if (!ok) s.errors++
  stats.set(route, s)
}

async function call(route, url, init) {
  const t = performance.now()
  try {
    const res = await fetch(BASE + url, init)
    const body = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text()
    record(route, performance.now() - t, res.ok)
    return res.ok ? body : null
  } catch {
    record(route, performance.now() - t, false)
    return null
  }
}

async function user(deadline, written) {
  const bundle = await call('POST /api/projects', '/api/projects', { method: 'POST' })
  if (!bundle) return
  const projectId = bundle.project.id
  created.push(projectId)
  const imageId = bundle.images[0].id
  const classId = bundle.classes[1].id
  const ids = []
  const confirmed = new Set()
  let loop = 0

  while (performance.now() < deadline) {
    loop++

    const upserts = Array.from({ length: SHAPES_PER_SYNC }, (_, i) => {
      const id = crypto.randomUUID()
      ids.push(id)
      const g = shape(loop + i)
      return {
        id, imageId, classId, geometry: g,
        bbox: [10, 20, 90, 120],
        attributes: { 'Liquid Level': (loop * 7) % 100, State: 'Open' },
      }
    })

    // every third loop, re-send the previous batch with changed attributes:
    // the retry and edit path, which must upsert rather than duplicate
    if (loop % 3 === 0 && ids.length > SHAPES_PER_SYNC * 2) {
      for (const id of ids.slice(-SHAPES_PER_SYNC * 2, -SHAPES_PER_SYNC)) {
        upserts.push({
          id, imageId, classId, geometry: shape(0),
          bbox: [10, 20, 90, 120], attributes: { 'Liquid Level': 50, State: 'Closed' },
        })
      }
    }

    const res = await call('POST sync', `/api/images/${imageId}/annotations/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ upserts, deletes: [] }),
    })
    if (res) {
      written.transactions++
      for (const u of upserts) confirmed.add(u.id)
    } else {
      written.failedBatches++
    }

    if (loop % 2 === 0) await call('GET project', `/api/projects/${projectId}`)
    if (loop % 10 === 0) await call('GET export', `/api/projects/${projectId}/export`)
  }

  written.projects.push({ projectId, expected: confirmed.size })
}

function pct(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
}

async function run(concurrency, db) {
  stats.clear()
  const written = { transactions: 0, failedBatches: 0, projects: [] }
  const start = performance.now()
  const deadline = start + SECONDS * 1000

  await Promise.all(Array.from({ length: concurrency }, () => user(deadline, written)))
  const elapsed = (performance.now() - start) / 1000

  let total = 0
  let errors = 0
  const rows = []
  for (const [route, s] of stats) {
    const sorted = s.times.sort((a, b) => a - b)
    total += sorted.length
    errors += s.errors
    rows.push({
      route,
      requests: sorted.length,
      errors: s.errors,
      p50_ms: Math.round(pct(sorted, 50)),
      p95_ms: Math.round(pct(sorted, 95)),
      p99_ms: Math.round(pct(sorted, 99)),
    })
  }

  // did every confirmed write land, and did failed batches leave nothing?
  const ids = written.projects.map((p) => p.projectId)
  const { rows: counted } = await db.query(
    `select i."projectId" as id, count(a.id)::int as n
       from "Annotation" a join "ImageAsset" i on i.id = a."imageId"
      where i."projectId" = any($1) group by i."projectId"`,
    [ids],
  )
  const actual = new Map(counted.map((r) => [r.id, r.n]))
  const expected = written.projects.reduce((n, p) => n + p.expected, 0)
  const stored = written.projects.reduce((n, p) => n + (actual.get(p.projectId) ?? 0), 0)

  console.log(`\n== ${concurrency} concurrent users, ${elapsed.toFixed(1)}s ==`)
  console.table(rows)
  console.log({
    totalRequests: total,
    requestsPerSec: Math.round(total / elapsed),
    errors,
    errorRate: `${((errors / total) * 100).toFixed(2)}%`,
    syncTransactionsCommitted: written.transactions,
    syncBatchesFailed: written.failedBatches,
    annotationsConfirmed: expected,
    annotationsInDb: stored,
    lostConfirmedWrites: Math.max(0, expected - stored),
    partialWritesFromFailedBatches: Math.max(0, stored - expected),
  })
}

async function dbSizeMb(db) {
  const { rows } = await db.query('select pg_database_size(current_database()) as b')
  return Math.round(Number(rows[0].b) / 1024 / 1024)
}

const db = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: LOCAL ? undefined : { rejectUnauthorized: false },
})
await db.connect()
console.log(`target ${BASE}, database ${await dbSizeMb(db)} MB before`)

try {
  for (const level of LEVELS) {
    await run(level, db)
    const size = await dbSizeMb(db)
    console.log(`database now ${size} MB`)
    if (size > MAX_DB_MB) {
      console.log(`over ${MAX_DB_MB} MB, stopping early`)
      break
    }
  }
} finally {
  if (!LOCAL) {
    const { rowCount } = await db.query('delete from "Project" where id = any($1)', [created])
    console.log(`cleanup: deleted ${rowCount} of ${created.length} test projects`)
  }
  await db.end()
}
