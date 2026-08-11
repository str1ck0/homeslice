import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database.types'

export type Profile = Database['public']['Tables']['profiles']['Row']

export class NotSignedInError extends Error {
  constructor() {
    super('You need to be signed in')
    this.name = 'NotSignedInError'
  }
}

/** The signed-in user's profile, or null when there is no session. */
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('auth_user_id', user.id)
    .single()

  return data ?? null
}

/** Same, but throws when there is no session. For code that cannot proceed without one. */
export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile()
  if (!profile) throw new NotSignedInError()
  return profile
}
