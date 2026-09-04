import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

/**
 * Prisma client, created on first use.
 *
 * The connection is built lazily on purpose. A build imports every route module
 * to read its config, so constructing the client at module load would make the
 * whole build fail whenever DATABASE_URL is absent. That happens on any deploy
 * where the variable has not been set yet, and on CI.
 *
 * Deferring it means the build always succeeds and a missing variable surfaces
 * at request time instead, where the client already knows how to fall back to
 * running in memory.
 *
 * DATABASE_URL should be the pooled connection. Serverless functions open many
 * short-lived connections and Postgres refuses them well before traffic gets
 * interesting. Migrations use DIRECT_URL, see prisma.config.ts.
 *
 * The instance is cached on globalThis because the dev server hot-reloads
 * modules, and without that every edit would open another pool.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.')
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })
}

function resolve(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const client = createClient()
    if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = client
    else return (globalForPrisma.prisma = client)
  }
  return globalForPrisma.prisma
}

/** Behaves like a PrismaClient, but nothing connects until a property is read. */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = resolve()
    const value = Reflect.get(client, prop, client)
    return typeof value === 'function' ? value.bind(client) : value
  },
})

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL)
}
