/**
 * Your own profile.
 *
 * Separate from `session.ts`, which only reads who you are. Everything here
 * writes, and only ever to your own row — the `profiles_update_own` policy
 * matches on `auth_user_id = auth.uid()`, so there is no id to pass and no way
 * to aim this at somebody else.
 */

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from './session'

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1, 'Your name cannot be empty').max(80),
  // Three letters, not a fixed list: the picker offers suggestions, and the
  // column has never constrained which currencies exist.
  defaultCurrency: z.string().trim().length(3),
})

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>

export async function updateProfile(input: UpdateProfileInput): Promise<void> {
  const parsed = updateProfileSchema.parse(input)
  const me = await requireProfile()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('profiles')
    .update({
      display_name: parsed.displayName,
      default_currency: parsed.defaultCurrency,
    })
    .eq('id', me.id)
    .select('id')

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) {
    throw new Error('Could not save your profile')
  }
}
