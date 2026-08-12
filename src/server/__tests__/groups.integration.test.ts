/**
 * Group membership and deletion, against the real Supabase project.
 *
 * Separate from rls.integration.test.ts because these tests delete the group
 * they work on, and that file's group is shared by everything in it.
 *
 * The deletion tests exist because `DELETE ... RETURNING` is the same shape as
 * the INSERT trap already hit twice: the row has to still be visible to the
 * SELECT policy for the returned rows to come back, and `groups_select` decides
 * visibility from group_members — the very table the delete cascades into.
 * Whether that survives is not something a typecheck can tell you.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import WebSocket from 'ws'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const hasCredentials = Boolean(url && anonKey && serviceKey)

const clientOptions = {
  auth: { persistSession: false },
  realtime: { transport: WebSocket as unknown as never },
}

const admin = hasCredentials ? createClient(url!, serviceKey!, clientOptions) : null

const stamp = Date.now()
const PASSWORD = 'test-password-4Wq!zz'

interface TestUser {
  authId: string
  profileId: string
  email: string
  client: SupabaseClient
}

async function createUser(name: string): Promise<TestUser> {
  const email = `test-${name}-${stamp}@homeslice.test`

  const { data: created, error: createError } = await admin!.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: name },
  })
  if (createError) throw createError

  const client = createClient(url!, anonKey!, clientOptions)
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (signInError) throw signInError

  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('id')
    .eq('auth_user_id', created.user.id)
    .single()
  if (profileError) throw profileError

  return { authId: created.user.id, profileId: profile.id, email, client }
}

const describeIntegration = hasCredentials ? describe : describe.skip

describeIntegration('group membership and deletion', () => {
  let owner: TestUser
  let friend: TestUser
  let stranger: TestUser
  const createdGroupIds: string[] = []

  async function newGroup(name: string): Promise<string> {
    const { data, error } = await owner.client.rpc('create_group', {
      p_name: name,
      p_label: null,
      p_currency: 'ZAR',
    })
    if (error) throw error
    const id = data as string
    createdGroupIds.push(id)
    return id
  }

  beforeAll(async () => {
    ;[owner, friend, stranger] = await Promise.all([
      createUser('owner'),
      createUser('friend'),
      createUser('stranger'),
    ])

    // Owner and friend know each other; stranger knows nobody.
    const { error } = await owner.client.rpc('add_friend', {
      p_identifier: friend.email,
      p_display_name: null,
    })
    if (error) throw error
  }, 60_000)

  afterAll(async () => {
    if (!admin) return
    for (const id of createdGroupIds) await admin.from('groups').delete().eq('id', id)
    for (const user of [owner, friend, stranger]) {
      if (!user) continue
      await admin.from('expenses').delete().eq('created_by', user.profileId)
      await admin.from('friendships').delete().eq('profile_a', user.profileId)
      await admin.from('friendships').delete().eq('profile_b', user.profileId)
      await admin.from('profiles').delete().eq('id', user.profileId)
      await admin.auth.admin.deleteUser(user.authId)
    }
  }, 60_000)

  describe('adding an existing friend', () => {
    let groupId: string

    beforeAll(async () => {
      groupId = await newGroup('Euro Trip')
    })

    it('adds a friend to the group', async () => {
      const { error } = await owner.client.rpc('add_group_member', {
        p_group_id: groupId,
        p_profile_id: friend.profileId,
      })
      expect(error).toBeNull()

      const { data } = await owner.client
        .from('group_members')
        .select('profile_id, role, left_at')
        .eq('group_id', groupId)
        .eq('profile_id', friend.profileId)
        .single()

      expect(data?.role).toBe('member')
      expect(data?.left_at).toBeNull()
    })

    it('lets the added friend see the group', async () => {
      const { data } = await friend.client.from('groups').select('id').eq('id', groupId)
      expect(data).toHaveLength(1)
    })

    it('is idempotent — adding twice does not duplicate or fail', async () => {
      const { error } = await owner.client.rpc('add_group_member', {
        p_group_id: groupId,
        p_profile_id: friend.profileId,
      })
      expect(error).toBeNull()

      const { data } = await owner.client
        .from('group_members')
        .select('id')
        .eq('group_id', groupId)
        .eq('profile_id', friend.profileId)

      expect(data).toHaveLength(1)
    })

    it('refuses to add someone you have no connection to', async () => {
      const { error } = await owner.client.rpc('add_group_member', {
        p_group_id: groupId,
        p_profile_id: stranger.profileId,
      })
      expect(error).not.toBeNull()
      expect(error!.message).toMatch(/friend/i)
    })

    it('refuses to add anyone to a group you are not in', async () => {
      const { error } = await stranger.client.rpc('add_group_member', {
        p_group_id: groupId,
        p_profile_id: stranger.profileId,
      })
      expect(error).not.toBeNull()
      expect(error!.message).toMatch(/not a member/i)
    })

    it('brings someone back after they have left', async () => {
      await admin!
        .from('group_members')
        .update({ left_at: new Date().toISOString() })
        .eq('group_id', groupId)
        .eq('profile_id', friend.profileId)

      const { error } = await owner.client.rpc('add_group_member', {
        p_group_id: groupId,
        p_profile_id: friend.profileId,
      })
      expect(error).toBeNull()

      const { data } = await owner.client
        .from('group_members')
        .select('left_at')
        .eq('group_id', groupId)
        .eq('profile_id', friend.profileId)
        .single()

      expect(data?.left_at).toBeNull()
    })
  })

  describe('deleting a group', () => {
    it('returns the deleted row, so the app can tell a denial from a success', async () => {
      const groupId = await newGroup('Delete Me')

      // This is the assertion that matters: .select() after .delete() is what
      // the service uses to distinguish "deleted" from "policy said no".
      const { data, error } = await owner.client
        .from('groups')
        .delete()
        .eq('id', groupId)
        .select('id')

      expect(error).toBeNull()
      expect(data).toHaveLength(1)
      expect(data![0].id).toBe(groupId)
    })

    it('really removes the group', async () => {
      const groupId = await newGroup('Also Delete Me')
      await owner.client.from('groups').delete().eq('id', groupId).select('id')

      const { data } = await admin!.from('groups').select('id').eq('id', groupId)
      expect(data).toEqual([])
    })

    it('takes the expenses in it with it', async () => {
      const groupId = await newGroup('Has Expenses')

      const { data: expenseId, error: expenseError } = await owner.client.rpc('create_expense', {
        p_group_id: groupId,
        p_description: 'Dinner',
        p_amount_cents: 10000,
        p_currency: 'EUR',
        p_expense_date: '2026-08-12',
        p_split_type: 'equal',
        p_category_id: null,
        p_note: null,
        p_participants: [
          { profile_id: owner.profileId, paid_cents: 10000, owed_cents: 10000, split_weight: 1 },
        ],
      })
      expect(expenseError).toBeNull()

      await owner.client.from('groups').delete().eq('id', groupId).select('id')

      const { data } = await admin!.from('expenses').select('id').eq('id', expenseId as string)
      expect(data).toEqual([])
    })

    it('refuses a non-admin member, deleting nothing', async () => {
      const groupId = await newGroup('Owner Only')
      await owner.client.rpc('add_group_member', {
        p_group_id: groupId,
        p_profile_id: friend.profileId,
      })

      const { data } = await friend.client.from('groups').select('id').eq('id', groupId)
      expect(data).toHaveLength(1) // friend really is in the group

      const { data: deleted } = await friend.client
        .from('groups')
        .delete()
        .eq('id', groupId)
        .select('id')

      // Nothing returned means the policy refused — the service turns this
      // empty result into "only an admin can delete this group".
      expect(deleted ?? []).toEqual([])

      const { data: still } = await admin!.from('groups').select('id').eq('id', groupId)
      expect(still).toHaveLength(1)
    })

    it('refuses a non-member outright', async () => {
      const groupId = await newGroup('Private')

      const { data: deleted } = await stranger.client
        .from('groups')
        .delete()
        .eq('id', groupId)
        .select('id')

      expect(deleted ?? []).toEqual([])

      const { data: still } = await admin!.from('groups').select('id').eq('id', groupId)
      expect(still).toHaveLength(1)
    })
  })

  describe('correcting mistakes', () => {
    it('renames a group as an admin, and returns the row', async () => {
      const groupId = await newGroup('Typo Grp')

      const { data, error } = await owner.client
        .from('groups')
        .update({ name: 'Euro 2026', label: 'Trip' })
        .eq('id', groupId)
        .select('id, name')

      expect(error).toBeNull()
      expect(data).toHaveLength(1)
      expect(data![0].name).toBe('Euro 2026')
    })

    it('refuses a rename from a non-admin member, changing nothing', async () => {
      const groupId = await newGroup('Owner Named')
      await owner.client.rpc('add_group_member', {
        p_group_id: groupId,
        p_profile_id: friend.profileId,
      })

      const { data } = await friend.client
        .from('groups')
        .update({ name: 'Hijacked' })
        .eq('id', groupId)
        .select('id')

      expect(data ?? []).toEqual([])

      const { data: still } = await admin!.from('groups').select('name').eq('id', groupId).single()
      expect(still!.name).toBe('Owner Named')
    })

    it('lets an admin remove a member by setting left_at', async () => {
      const groupId = await newGroup('Remove Me')
      await owner.client.rpc('add_group_member', {
        p_group_id: groupId,
        p_profile_id: friend.profileId,
      })

      const { data, error } = await owner.client
        .from('group_members')
        .update({ left_at: new Date().toISOString() })
        .eq('group_id', groupId)
        .eq('profile_id', friend.profileId)
        .is('left_at', null)
        .select('id')

      expect(error).toBeNull()
      expect(data).toHaveLength(1)
    })

    it('hides the group from someone who has left', async () => {
      const groupId = await newGroup('Left Behind')
      await owner.client.rpc('add_group_member', {
        p_group_id: groupId,
        p_profile_id: friend.profileId,
      })

      const { data: before } = await friend.client.from('groups').select('id').eq('id', groupId)
      expect(before).toHaveLength(1)

      await friend.client
        .from('group_members')
        .update({ left_at: new Date().toISOString() })
        .eq('group_id', groupId)
        .eq('profile_id', friend.profileId)

      // my_group_ids() filters on left_at, so leaving really does revoke access
      // rather than just hiding a row in the members list.
      const { data: after } = await friend.client.from('groups').select('id').eq('id', groupId)
      expect(after ?? []).toEqual([])
    })

    it('lets a member leave on their own without being an admin', async () => {
      const groupId = await newGroup('Self Exit')
      await owner.client.rpc('add_group_member', {
        p_group_id: groupId,
        p_profile_id: friend.profileId,
      })

      const { data, error } = await friend.client
        .from('group_members')
        .update({ left_at: new Date().toISOString() })
        .eq('group_id', groupId)
        .eq('profile_id', friend.profileId)
        .is('left_at', null)
        .select('id')

      expect(error).toBeNull()
      expect(data).toHaveLength(1)
    })

    it('stops a member removing somebody else', async () => {
      const groupId = await newGroup('No Kicking')
      await owner.client.rpc('add_group_member', {
        p_group_id: groupId,
        p_profile_id: friend.profileId,
      })

      const { data } = await friend.client
        .from('group_members')
        .update({ left_at: new Date().toISOString() })
        .eq('group_id', groupId)
        .eq('profile_id', owner.profileId)
        .select('id')

      expect(data ?? []).toEqual([])

      const { data: still } = await admin!
        .from('group_members')
        .select('left_at')
        .eq('group_id', groupId)
        .eq('profile_id', owner.profileId)
        .single()
      expect(still!.left_at).toBeNull()
    })

    it('updates your own profile and returns the row', async () => {
      const { data, error } = await owner.client
        .from('profiles')
        .update({ display_name: 'Renamed Owner', default_currency: 'EUR' })
        .eq('id', owner.profileId)
        .select('id, display_name, default_currency')

      expect(error).toBeNull()
      expect(data).toHaveLength(1)
      expect(data![0].display_name).toBe('Renamed Owner')
      expect(data![0].default_currency).toBe('EUR')
    })

    it("stops you editing somebody else's profile", async () => {
      const { data } = await owner.client
        .from('profiles')
        .update({ display_name: 'Vandalised' })
        .eq('id', stranger.profileId)
        .select('id')

      expect(data ?? []).toEqual([])

      const { data: still } = await admin!
        .from('profiles')
        .select('display_name')
        .eq('id', stranger.profileId)
        .single()
      expect(still!.display_name).not.toBe('Vandalised')
    })

    it('removes a friendship, leaving both profiles intact', async () => {
      const { data: deleted, error } = await owner.client
        .from('friendships')
        .delete()
        .eq('profile_a', owner.profileId < friend.profileId ? owner.profileId : friend.profileId)
        .eq('profile_b', owner.profileId < friend.profileId ? friend.profileId : owner.profileId)
        .select('id')

      expect(error).toBeNull()
      expect(deleted).toHaveLength(1)

      const { data: profiles } = await admin!
        .from('profiles')
        .select('id')
        .in('id', [owner.profileId, friend.profileId])
      expect(profiles).toHaveLength(2)
    })
  })

  describe('multiple currencies in one group', () => {
    it('accepts expenses in different currencies in the same group', async () => {
      const groupId = await newGroup('Three Countries')

      for (const [currency, amount] of [
        ['EUR', 4500],
        ['GBP', 3200],
        ['ZAR', 89900],
      ] as const) {
        const { error } = await owner.client.rpc('create_expense', {
          p_group_id: groupId,
          p_description: `Lunch in ${currency}`,
          p_amount_cents: amount,
          p_currency: currency,
          p_expense_date: '2026-08-12',
          p_split_type: 'equal',
          p_category_id: null,
          p_note: null,
          p_participants: [
            {
              profile_id: owner.profileId,
              paid_cents: amount,
              owed_cents: amount,
              split_weight: 1,
            },
          ],
        })
        expect(error).toBeNull()
      }

      const { data } = await owner.client
        .from('expenses')
        .select('currency')
        .eq('group_id', groupId)

      expect(new Set((data ?? []).map((row) => row.currency))).toEqual(
        new Set(['EUR', 'GBP', 'ZAR'])
      )
    })
  })
})
