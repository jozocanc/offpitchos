import { NextResponse } from 'next/server'

/**
 * Which commit is actually serving traffic.
 *
 * Vercel deploys from a GitHub webhook, and a failed build leaves production
 * quietly serving the previous commit: the push succeeds, the site stays up,
 * and nothing anywhere says the new code never shipped. Twice in one day that
 * cost ten minutes of guessing whether a build had broken or was merely slow.
 *
 * Compare this against `git rev-parse HEAD` to answer that in one request:
 *
 *   curl -s https://offpitchos.com/api/version
 *
 * Deliberately public and deliberately tiny. A commit SHA is already visible in
 * a public repository, so this leaks nothing, and it has to work when the rest
 * of the app is broken, which rules out anything that touches auth or the
 * database.
 */
export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local',
    ref: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    env: process.env.VERCEL_ENV ?? 'development',
    builtAt: process.env.VERCEL_DEPLOYMENT_ID ?? null,
  })
}
