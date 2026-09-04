import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

/**
 * Prisma client singleton.
 *
 * Prisma 7 connects through a driver adapter rather than a bundled engine
 * binary, so the runtime connection string is supplied here rather than in the
 * schema.
 *
 * DATABASE_URL should be the POOLED connection. Serverless functions open many
 * short-lived connections, and Postgres will refuse them long before traffic is
 * interesting. Migrations use DIRECT_URL instead; see prisma.config.ts.
 *
 * The instance is cached on globalThis because Next's dev server hot-reloads
 * modules, and without this every edit would open another pool.
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

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL)
}
