import { defineConfig } from 'prisma/config'

/**
 * Prisma CLI configuration.
 *
 * Prisma 7 moved connection URLs out of schema.prisma. Migrations read theirs
 * from here. The runtime connection is separate and goes through the driver
 * adapter in lib/db/prisma.ts.
 *
 * Migrations use DIRECT_URL rather than the pooled connection, because PgBouncer
 * in transaction mode cannot run the session-level statements a migration needs.
 *
 * DIRECT_URL is read straight from the environment instead of Prisma's env()
 * helper, which throws when the variable is missing. `prisma generate` runs on
 * every install, including CI and deploy builds where no database connection
 * exists, and it does not need one. Migrations still fail loudly if it is unset.
 */
try {
  process.loadEnvFile('.env')
} catch {
  // no .env file, which is normal on a deploy where vars come from the environment
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DIRECT_URL,
  },
})
