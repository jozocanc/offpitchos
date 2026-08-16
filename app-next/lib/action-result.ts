/**
 * Result shape for Server Actions.
 *
 * Next.js replaces the message of an error THROWN from a Server Action with an
 * opaque digest in production, so `catch (e) { setError(e.message) }` on the
 * client shows the user a hex string instead of "Only the Director of Coaching
 * can delete teams". Returning the failure instead keeps the message intact.
 *
 * This is also the convention CLAUDE.md already specifies app-wide.
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string }

/**
 * Re-throw control-flow errors, convert everything else to { ok: false }.
 *
 * THIS IS THE LOAD-BEARING PART. `redirect()` and `notFound()` are implemented
 * by throwing a special error that Next catches upstream. A blanket
 * `catch` in an action would swallow them, and the user would sit on a page
 * that was supposed to redirect — with no error, because from the action's
 * point of view nothing went wrong. Both are identified by a `digest` string.
 *
 * `unstable_rethrow` exists for exactly this in newer Next versions, but it is
 * not stable API, so the digest check is done here explicitly rather than
 * depending on an internal import that can move between releases.
 */
export function toActionError(e: unknown): { ok: false; error: string } {
  const digest = (e as { digest?: unknown })?.digest
  if (typeof digest === 'string' && (
    digest === 'NEXT_NOT_FOUND' ||
    digest.startsWith('NEXT_REDIRECT') ||
    digest.startsWith('DYNAMIC_SERVER_USAGE') ||
    digest.startsWith('BAILOUT_TO_CLIENT_SIDE_RENDERING')
  )) {
    throw e
  }

  return {
    ok: false,
    error: e instanceof Error && e.message
      ? e.message
      : 'Something went wrong. Please try again.',
  }
}

/**
 * Unwrap a result server-side, re-throwing the message on failure.
 *
 * For SERVER callers only — one action calling another. The point of
 * ActionResult is that a message survives the trip to the client; between two
 * server functions a throw is still the natural control flow, and the caller
 * usually already has a try/catch that turns it into its own result shape.
 *
 * Never use this in a client component: it re-throws, which puts you straight
 * back to reading a redacted digest.
 */
export function unwrap<T>(r: ActionResult<T>): T {
  if (!r.ok) throw new Error(r.error)
  return r.data
}

/** Narrowing helper so callers can write `if (isErr(res)) return res.error`. */
export function isErr<T>(r: ActionResult<T>): r is { ok: false; error: string } {
  return !r.ok
}
