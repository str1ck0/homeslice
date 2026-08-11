/**
 * Friends — the people you can split with outside a group.
 *
 * Splitwise's model is a friend graph plus groups, and a lot of real use is
 * one-off splits with one person. Groups are optional in Homeslice, so this is
 * what makes that promise true rather than theoretical.
 */

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from './session'

export interface Friend {
  profileId: string
  displayName: string
  username: string | null
  email: string | null
  avatarUrl: string | null
  isPlaceholder: boolean
}

export const addFriendSchema = z
  .object({
    /** A username, or an email. Which one is decided by the presence of "@". */
    identifier: z.string().trim().max(255),
    displayName: z.string().trim().max(80).optional(),
  })
  .refine((value) => value.identifier !== '' || Boolean(value.displayName?.trim()), {
    message: 'Enter a username or email, or just a name',
  })
  .refine(
    (value) =>
      !value.identifier.includes('@') ||
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.identifier),
    { message: 'That does not look like a complete email address' }
  )

export async function addFriend(identifier: string, displayName?: string): Promise<string> {
  const parsed = addFriendSchema.parse({ identifier: identifier ?? '', displayName })
  await requireProfile()
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('add_friend', {
    p_identifier: parsed.identifier || null,
    p_display_name: parsed.displayName || null,
  } as never)

  if (error) throw new Error(error.message)
  return data as string
}

export async function setUsername(username: string): Promise<string | null> {
  await requireProfile()
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('set_username', {
    p_username: username,
  } as never)

  if (error) throw new Error(error.message)
  return (data as string | null) ?? null
}

export async function listFriends(): Promise<Friend[]> {
  const me = await requireProfile()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('friendships')
    .select(
      `profile_a, profile_b,
       a:profiles!friendships_profile_a_fkey(id, display_name, username, email, avatar_url, auth_user_id),
       b:profiles!friendships_profile_b_fkey(id, display_name, username, email, avatar_url, auth_user_id)`
    )
    .eq('status', 'accepted')

  if (error) throw new Error(error.message)

  type Row = {
    id: string
    display_name: string
    username: string | null
    email: string | null
    avatar_url: string | null
    auth_user_id: string | null
  }

  const friends = (data ?? []).map((row) => {
    // Friendships are stored as an ordered pair, so the friend is whichever
    // side is not you.
    const other = (row.profile_a === me.id ? row.b : row.a) as unknown as Row
    return {
      profileId: other.id,
      displayName: other.display_name,
      username: other.username,
      email: other.email,
      avatarUrl: other.avatar_url,
      isPlaceholder: other.auth_user_id === null,
    }
  })

  return friends.sort((a, b) => a.displayName.localeCompare(b.displayName))
}
