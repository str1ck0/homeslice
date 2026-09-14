/**
 * Friends — the people you can split with outside a group.
 *
 * Splitwise's model is a friend graph plus groups, and a lot of real use is
 * one-off splits with one person. Groups are optional in Homeslice, so this is
 * what makes that promise true rather than theoretical.
 *
 * Adding someone sends a request, and nothing happens until they accept it —
 * including being put in an expense. Names are unique and easy to guess, so
 * without that anybody could have put a debt on anybody's dashboard. The rule
 * is enforced in the database (20260914000000); this file only asks.
 */

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requestCache } from '@/lib/request-cache'
import { requireProfile } from './session'
import { getOverview, totalWith } from './overview'

export interface Friend {
  profileId: string
  displayName: string
  avatarUrl: string | null
}

export interface FriendRequests {
  /** People who asked you. */
  incoming: Friend[]
  /** People you asked, who have not answered. */
  outgoing: Friend[]
}

export const addFriendSchema = z.object({
  /** Their name on Homeslice, which is also what makes them findable. */
  name: z.string().trim().min(1, 'Enter their name').max(40),
})

/** Friendships are stored one way round, smallest id first. */
function orderedPair(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x]
}

/**
 * Ask someone to be friends, by the name they go by here.
 *
 * Names are unique and matched ignoring case and extra spaces, so "liam
 * strickland" finds "Liam Strickland". If they had already asked you, this
 * accepts instead — `accepted` says which happened.
 */
export async function addFriend(name: string): Promise<{ profileId: string; accepted: boolean }> {
  const parsed = addFriendSchema.parse({ name })
  const me = await requireProfile()
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('add_friend', {
    p_name: parsed.name,
  } as never)

  if (error) throw new Error(error.message)
  const profileId = data as string

  const [a, b] = orderedPair(me.id, profileId)
  const { data: row } = await supabase
    .from('friendships')
    .select('status')
    .eq('profile_a', a)
    .eq('profile_b', b)
    .maybeSingle()

  return { profileId, accepted: row?.status === 'accepted' }
}

/** Say yes to someone who asked you. */
export async function acceptFriend(profileId: string): Promise<void> {
  const parsed = z.string().uuid().parse(profileId)
  await requireProfile()
  const supabase = await createClient()

  const { error } = await supabase.rpc('accept_friend', { p_profile_id: parsed } as never)
  if (error) throw new Error(error.message)
}

/**
 * Turn down a request, or withdraw one you sent. The same row either way, and
 * either person may delete it.
 *
 * Only ever touches a pending row, so a slow double-tap on "Decline" cannot
 * remove a friendship that was accepted in the meantime.
 */
export async function declineFriendRequest(profileId: string): Promise<void> {
  const parsed = z.string().uuid().parse(profileId)
  const me = await requireProfile()
  const supabase = await createClient()

  const [a, b] = orderedPair(me.id, parsed)
  const { data, error } = await supabase
    .from('friendships')
    .delete()
    .eq('profile_a', a)
    .eq('profile_b', b)
    .eq('status', 'pending')
    .select('id')

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('That request is no longer there')
}

/**
 * Remove a friend.
 *
 * Only the friendship goes: shared expenses, and any group you are both still
 * in, are untouched. Refused while anything is outstanding between you, in any
 * group or none — a debt should be settled or written off deliberately, not
 * disappeared by tidying up a list.
 */
export async function removeFriend(profileId: string): Promise<void> {
  const parsed = z.string().uuid().parse(profileId)
  const me = await requireProfile()

  const overview = await getOverview(me.id)
  const outstanding = totalWith(overview, me.id, parsed)
  if (outstanding.size > 0) {
    throw new Error('Settle up with them before removing them')
  }

  const supabase = await createClient()
  const [a, b] = orderedPair(me.id, parsed)

  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('profile_a', a)
    .eq('profile_b', b)

  if (error) throw new Error(error.message)
}

/**
 * Every friendship row you are in, sorted into friends and requests.
 *
 * One query behind both listFriends and listFriendRequests, cached per request,
 * because the friends page and the dashboard want both.
 */
const loadFriendships = requestCache(async () => {
  const me = await requireProfile()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('friendships')
    .select(
      `profile_a, profile_b, status, requested_by,
       a:profiles!friendships_profile_a_fkey(id, display_name, avatar_url),
       b:profiles!friendships_profile_b_fkey(id, display_name, avatar_url)`
    )
    .in('status', ['accepted', 'pending'])

  if (error) throw new Error(error.message)

  type Row = { id: string; display_name: string; avatar_url: string | null }

  const friends: Friend[] = []
  const requests: FriendRequests = { incoming: [], outgoing: [] }

  for (const row of data ?? []) {
    // Stored as an ordered pair, so the other person is whichever side is not you.
    const other = (row.profile_a === me.id ? row.b : row.a) as unknown as Row
    const person = {
      profileId: other.id,
      displayName: other.display_name,
      avatarUrl: other.avatar_url,
    }

    if (row.status === 'accepted') friends.push(person)
    else if (row.requested_by === me.id) requests.outgoing.push(person)
    else requests.incoming.push(person)
  }

  const byName = (x: Friend, y: Friend) => x.displayName.localeCompare(y.displayName)
  friends.sort(byName)
  requests.incoming.sort(byName)
  requests.outgoing.sort(byName)

  return { friends, requests }
})

/** People who have accepted — the only people you can split with outside a group. */
export async function listFriends(): Promise<Friend[]> {
  return (await loadFriendships()).friends
}

export async function listFriendRequests(): Promise<FriendRequests> {
  return (await loadFriendships()).requests
}
