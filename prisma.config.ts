import { defineConfig, env } from 'prisma/config'

/**
 * Prisma CLI configuration.
 *
 * Two Prisma 7 changes are handled here:
 *
 * 1. `url` and `directUrl` were removed from schema.prisma. Migrations and
 *    introspection read their connection from this file instead; the runtime
 *    connection is separate and goes through the driver adapter in
 *    lib/db/prisma.ts.
 *
 * 2. The CLI no longer loads `.env` automatically, so we load it ourselves.
 *    Next.js still loads `.env` on its own, so this only affects CLI commands
 *    like `prisma migrate` and `prisma studio`.
 *
 * Migrations deliberately use DIRECT_URL rather than the pooled connection:
 * PgBouncer in transaction mode cannot run the session-level statements a
 * migration needs, and pointing migrate at the pooler fails in confusing ways.
 */
try {
  process.loadEnvFile('.env')
} catch {
  // no .env present; the CLI will report the missing variable itself
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DIRECT_URL'),
  },
})
