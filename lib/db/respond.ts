import { BadRequest } from './validate'

/**
 * Uniform error shape for route handlers.
 *
 * Client bugs get a 400 with the reason, so the browser console says what was
 * wrong. Anything else is logged server-side and returned as a bare 500: an
 * internal error message can leak connection strings and table names, and the
 * client can do nothing useful with it anyway.
 */
export function handleError(err: unknown): Response {
  if (err instanceof BadRequest) {
    return Response.json({ error: err.message }, { status: 400 })
  }

  console.error('[api]', err)
  return Response.json({ error: 'Internal error' }, { status: 500 })
}
