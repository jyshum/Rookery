import { createClient } from '@supabase/supabase-js'

/**
 * Supabase client, used for Storage only.
 *
 * All database access goes through Prisma. Supabase is the host; Prisma is the
 * interface. Keeping that boundary means the API layer is not tied to Supabase
 * at all, and moving to another Postgres is a connection string change.
 *
 * Server-side only: this uses the service role key, which must never reach the
 * browser. Uploads are proxied through our own route for exactly that reason.
 */
export const STORAGE_BUCKET = 'lab-images'

export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    )
  }

  return createClient(url, key, { auth: { persistSession: false } })
}

export function isStorageConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}
