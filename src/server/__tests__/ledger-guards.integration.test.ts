/**
 * Memberships and the ledger cannot be rewritten from a browser.
 *
 * Every test here is something that worked, with the app's own public key and
 * an ordinary signed-in session, until 20260914010000 — and the thing next to it
 * that the app still has to be able to do.
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
  displayName: string
  client: SupabaseClient
}

async function createUser(name: string): Promise<TestUser> {
  const email = `test-${name}-${stamp}@homeslice.test`
  const displayName = `${name}-${stamp}`

  const { data: created, error: createError } = await admin!.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: displayName },
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

  return { authId: created.user.id, profileId: profile.id, displayName, client }
}

const describeIntegration = hasCredentials ? describe : describe.skip

describeIntegration('memberships and the ledger', () => {
  let owner: TestUser
  let member: TestUser
  let outsider: TestUser
  let groupId: string
  let inviteCode: string
  const groupIds: string[] = []

  async function newGroup(name: string): Promise<string> {
    const { data, error } = await owner.client.rpc('create_group', {
      p_name: `${name} ${stamp}`,
      p_label: null,
      p_currency: 'EUR',
    })
    if (error) throw error
    groupIds.push(data as string)
    return data as string
  }

  async function membership(user: TestUser) {
    const { data } = await admin!
      .from('group_members')
      .select('role, left_at')
      .eq('group_id', groupId)
      .eq('profile_id', user.profileId)
      .maybeSingle()
    return data
  }

  beforeAll(async () => {
    ;[owner, member, outsider] = await Promise.all([
      createUser('owner'),
      createUser('member'),
      createUser('outsider'),
    ])

    groupId = await newGroup('Guarded')
    const { data } = await owner.client.from('groups').select('invite_code').eq('id', groupId).single()
    inviteCode = data!.invite_code

    const { error } = await member.client.rpc('join_group_by_code', { code: inviteCode })
    if (error) throw error
  }, 60_000)

  afterAll(async () => {
    if (!admin) return
    const ids = [owner, member, outsider].filter(Boolean).map((u) => u.profileId)
    await admin.from('settlements').delete().in('created_by', ids)
    await admin.from('expenses').delete().in('created_by', ids)
    if (groupIds.length) await admin.from('groups').delete().in('id', groupIds)
    await admin.from('friendships').delete().in('profile_a', ids)
    await admin.from('friendships').delete().in('profile_b', ids)
    await admin.from('profiles').delete().in('id', ids)
    for (const user of [owner, member, outsider]) {
      if (user) await admin.auth.admin.deleteUser(user.authId)
    }
  }, 60_000)

  describe('joining', () => {
    it('still makes whoever creates a group its admin', async () => {
      expect((await membership(owner))!.role).toBe('admin')
    })

    it('will not let an outsider add themselves to a group by its id', async () => {
      const { error } = await outsider.client
        .from('group_members')
        .insert({ group_id: groupId, profile_id: outsider.profileId, role: 'admin' })

      expect(error).not.toBeNull()
      expect(await membership(outsider)).toBeNull()
    })
  })

  describe('changing a membership', () => {
    it('will not let a member make themselves admin', async () => {
      const { error } = await member.client
        .from('group_members')
        .update({ role: 'admin' })
        .eq('group_id', groupId)
        .eq('profile_id', member.profileId)

      expect(error).not.toBeNull()
      expect((await membership(member))!.role).toBe('member')
    })

    it('still lets a member leave', async () => {
      const { data, error } = await member.client
        .from('group_members')
        .update({ left_at: new Date().toISOString() })
        .eq('group_id', groupId)
        .eq('profile_id', member.profileId)
        .select('id')

      expect(error).toBeNull()
      expect(data).toHaveLength(1)
    })

    it('will not let someone who left put themselves back', async () => {
      const { error } = await member.client
        .from('group_members')
        .update({ left_at: null })
        .eq('group_id', groupId)
        .eq('profile_id', member.profileId)

      expect(error).not.toBeNull()
      expect((await membership(member))!.left_at).not.toBeNull()
    })

    it('lets them back in with the invite code', async () => {
      const { error } = await member.client.rpc('join_group_by_code', { code: inviteCode })

      expect(error).toBeNull()
      expect(await membership(member)).toEqual({ role: 'member', left_at: null })
    })

    it('still lets an admin make someone else admin', async () => {
      const { data, error } = await owner.client
        .from('group_members')
        .update({ role: 'admin' })
        .eq('group_id', groupId)
        .eq('profile_id', member.profileId)
        .select('id')

      expect(error).toBeNull()
      expect(data).toHaveLength(1)

      // Put it back, so the member is an ordinary member for what follows.
      await admin!
        .from('group_members')
        .update({ role: 'member' })
        .eq('group_id', groupId)
        .eq('profile_id', member.profileId)
    })
  })

  describe('the ledger', () => {
    let expenseId: string
    let settlementId: string

    beforeAll(async () => {
      const { data, error } = await owner.client.rpc('create_expense', {
        p_group_id: groupId,
        p_description: `Guarded dinner ${stamp}`,
        p_amount_cents: 4000,
        p_currency: 'EUR',
        p_expense_date: null,
        p_split_type: 'equal',
        p_category_id: null,
        p_note: null,
        p_participants: [
          { profile_id: owner.profileId, paid_cents: 4000, owed_cents: 2000 },
          { profile_id: member.profileId, paid_cents: 0, owed_cents: 2000 },
        ],
      })
      if (error) throw error
      expenseId = data as string

      const { error: eventError } = await owner.client
        .from('expense_events')
        .insert({ expense_id: expenseId, actor_id: owner.profileId, kind: 'added' })
      if (eventError) throw eventError

      const { data: settlement, error: settlementError } = await member.client
        .from('settlements')
        .insert({
          group_id: groupId,
          from_profile: member.profileId,
          to_profile: owner.profileId,
          amount_cents: 2000,
          currency: 'EUR',
          created_by: member.profileId,
        })
        .select('id')
        .single()
      if (settlementError) throw settlementError
      settlementId = settlement.id
    }, 60_000)

    it('will not let anyone in an expense delete it outright', async () => {
      const { data } = await member.client
        .from('expenses')
        .delete()
        .eq('id', expenseId)
        .select('id')
      expect(data ?? []).toEqual([])

      const { data: still } = await admin!.from('expenses').select('id').eq('id', expenseId)
      expect(still).toHaveLength(1)

      const { data: events } = await admin!
        .from('expense_events')
        .select('id')
        .eq('expense_id', expenseId)
      expect(events).toHaveLength(1)
    })

    it('still lets them delete it the way the app does', async () => {
      const { data, error } = await member.client
        .from('expenses')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', expenseId)
        .select('id')

      expect(error).toBeNull()
      expect(data).toHaveLength(1)
    })

    it('will not let anyone delete a payment outright', async () => {
      const { data } = await member.client
        .from('settlements')
        .delete()
        .eq('id', settlementId)
        .select('id')
      expect(data ?? []).toEqual([])

      const { data: still } = await admin!.from('settlements').select('id').eq('id', settlementId)
      expect(still).toHaveLength(1)
    })

    it('will not let an admin delete a group with history, even deleted history', async () => {
      // The only expense in it is soft-deleted by now, and it still counts.
      const { data } = await owner.client.from('groups').delete().eq('id', groupId).select('id')
      expect(data ?? []).toEqual([])

      const { data: still } = await admin!.from('groups').select('id').eq('id', groupId)
      expect(still).toHaveLength(1)
    })

    it('still lets an admin delete a group with nothing in it', async () => {
      const emptyId = await newGroup('Empty')
      const { data, error } = await owner.client
        .from('groups')
        .delete()
        .eq('id', emptyId)
        .select('id')

      expect(error).toBeNull()
      expect(data).toHaveLength(1)
    })

    it('lets an admin archive a group with history instead', async () => {
      const { data, error } = await owner.client
        .from('groups')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', groupId)
        .select('id')

      expect(error).toBeNull()
      expect(data).toHaveLength(1)
    })
  })

  describe('receipts', () => {
    it('refuses a file that is not an image', async () => {
      const { error } = await owner.client.storage
        .from('receipts')
        .upload(`${owner.authId}/not-a-photo-${stamp}.txt`, new Blob(['hello'], { type: 'text/plain' }), {
          contentType: 'text/plain',
        })

      expect(error).not.toBeNull()
    })
  })
})
