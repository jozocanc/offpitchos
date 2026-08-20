import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { createHmac } from 'crypto'

const publicPrefixes = ['/login', '/signup', '/join', '/auth/callback', '/forgot-password', '/pitch.html', '/privacy', '/terms', '/camps/register', '/access', '/pricing', '/share', '/collect']
const publicExact = new Set(['/'])

// Routes that still need early-access gating even though they're public.
// Team/camp invite links bypass the gate since the prospect has been invited.
const gatedPrefixes = ['/login', '/signup', '/forgot-password']

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// An invite link IS a credential. Asking an invited coach for the early-access
// code as well puts a wall in front of the one person we want through it. The
// token is validated, not merely present, so `?invite=anything` cannot open
// public signup.
async function hasValidInvite(
  supabase: ReturnType<typeof createServerClient>,
  params: URLSearchParams
): Promise<boolean> {
  const token = params.get('invite')
  if (!token || !UUID.test(token)) return false

  const { data } = await supabase
    .rpc('get_invite_by_token', { invite_token: token })
    .single()

  const invite = data as { status?: string; expires_at?: string | null } | null
  if (!invite || invite.status !== 'pending') return false
  return !invite.expires_at || new Date(invite.expires_at) > new Date()
}

function isAccessCookieValid(cookie: string | undefined): boolean {
  if (!cookie) return false
  const parts = cookie.split(':')
  if (parts.length !== 3) return false
  const [version, ts, provided] = parts
  const secret = process.env.ACCESS_SECRET || 'dev-secret-change-me'
  const expected = createHmac('sha256', secret).update(`${version}:${ts}`).digest('hex')
  return provided === expected
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value)
          })
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options)
          })
          if (headers) {
            Object.entries(headers).forEach(([key, value]) => {
              supabaseResponse.headers.set(key, value)
            })
          }
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const isPublicRoute = publicExact.has(pathname) || publicPrefixes.some(route => pathname.startsWith(route))

  // Early-access gate: block /login, /signup, /forgot-password for anyone
  // without a valid access cookie. Applies only when ACCESS_CODE env is set
  // so local dev without the env stays unblocked.
  const accessConfigured = Boolean(process.env.ACCESS_CODE)
  const needsGate = accessConfigured && gatedPrefixes.some(p => pathname.startsWith(p))
  if (needsGate) {
    const accessCookie = request.cookies.get('offpitchos_access')?.value
    const allowed =
      isAccessCookieValid(accessCookie) ||
      (await hasValidInvite(supabase, request.nextUrl.searchParams))
    if (!allowed) {
      const url = request.nextUrl.clone()
      url.pathname = '/access'
      url.searchParams.set('next', pathname + request.nextUrl.search)
      return NextResponse.redirect(url)
    }
  }

  // Not logged in and trying to access protected route
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Logged in and trying to access login/signup
  if (user && (pathname === '/login' || pathname === '/signup')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // Skip API, Next internals, common static assets (images/fonts/media) so
    // files in /public are served directly without passing through auth gating.
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:jpg|jpeg|png|svg|ico|webp|gif|avif|woff|woff2|ttf|otf|mp4|webm|mp3|wav|json|txt|xml|pdf|html|css|js)$).*)',
  ],
}
