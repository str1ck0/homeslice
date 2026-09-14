import { createClient } from '@/lib/supabase/server'
import { requestCache } from '@/lib/request-cache'
import type { Database } from '@/types/database.types'

export type Profile = Database['public']['Tables']['profiles']['Row']

export class NotSignedInError extends Error {
  constructor() {
    super('You need to be signed in')
    this.name = 'NotSignedInError'
  }
}

/**
 * Every profiles column the API is allowed to read. email is deliberately
 * missing: since 20260914000000 nobody can read it through the API, so asking
 * for `*` is a permissions error.
 */
const PROFILE_COLUMNS = 'id, auth_user_id, display_name, avatar_url, default_currency, created_at, updated_at'

/**
 * The signed-in user's profile, or null when there is no session.
 *
 * Wrapped in React's cache(), so a page and every service it calls share one
 * lookup per request. Pages ask, and then listFriends and friends ask again,
 * and each ask was a round trip to Supabase for the session and another for
 * the row.
 *
 * Your own email comes from the session rather than the row, which no longer
 * hands it out.
 */
export const getCurrentProfile = requestCache(async (): Promise<Profile | null> => {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('auth_user_id', user.id)
    .single()

  return data ? { ...data, email: user.email ?? null } : null
})

/** Same, but throws when there is no session. For code that cannot proceed without one. */
export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile()
  if (!profile) throw new NotSignedInError()
  return profile
}
