import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/** Routes reachable without being signed in. Everything else requires a session. */
const PUBLIC_ROUTES = ['/', '/auth', '/reset-password', '/auth/callback']

function isPublic(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  )
}

/**
 * Refreshes the auth session on every request and gates protected routes
 * before any HTML is sent.
 *
 * The previous version of the app redirected from inside `useEffect`, which
 * meant an unauthenticated visitor rendered the dashboard in their browser and
 * only then got bounced. Doing it here means they never receive the page.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    }
  )

  // getUser() revalidates the token with Supabase. getSession() only decodes
  // the cookie, which a client could have tampered with.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  if (!user && !isPublic(pathname)) {
    const signIn = request.nextUrl.clone()
    signIn.pathname = '/auth'
    // Send them back where they were heading once they are signed in.
    signIn.searchParams.set('next', pathname)
    return NextResponse.redirect(signIn)
  }

  if (user && (pathname === '/auth' || pathname === '/')) {
    const home = request.nextUrl.clone()
    home.pathname = '/dashboard'
    home.search = ''
    return NextResponse.redirect(home)
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files — those never need a
     * session check and running middleware on them wastes invocations.
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
