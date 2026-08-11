import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database.types'

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * Acts as the signed-in user, so RLS still applies — this is the normal way to
 * read and write data on the server. For the rare operation that must bypass
 * RLS, use `createAdminClient` and be deliberate about it.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Server Components cannot set cookies. The middleware refreshes
            // the session on every request, so this is safe to swallow.
          }
        },
      },
    }
  )
}

/**
 * Service-role client. Bypasses RLS completely.
 *
 * Only for operations that genuinely cannot be expressed as the current user —
 * the recurring-expense cron, for instance, which runs with no user at all.
 * Never import this into anything that renders in the browser.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  }

  return createSupabaseClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
