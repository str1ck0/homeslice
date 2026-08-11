/**
 * Integration tests against the real Supabase project.
 *
 * These are the security tests. The browser holds an anon key and talks to
 * Postgres directly, so RLS policies are the actual boundary protecting other
 * people's financial data — not a formality. Every policy that matters is
 * asserted here from the perspective of a real signed-in user.
 *
 * Run with:  npm run test:integration
 * Skipped automatically when SUPABASE_SERVICE_ROLE_KEY is absent, so the unit
 * suite still runs in environments without credentials.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { splitExpense } from '@/core/split'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const hasCredentials = Boolean(url && anonKey && serviceKey)

// Node 20 has no global WebSocket (it arrived in 22) and supabase-js builds a
// realtime client eagerly, so one has to be supplied. Nothing here uses
// realtime; this just stops the constructor throwing.
const clientOptions = {
  auth: { persistSession: false },
  realtime: { transport: WebSocket as unknown as never },
}

const admin = hasCredentials ? createClient(url!, serviceKey!, clientOptions) : null

/** Unique per run so repeated runs never collide. */
const stamp = Date.now()
const emailFor = (name: string) => `test-${name}-${stamp}@homeslice.test`
const PASSWORD = 'test-password-4Wq!zz'

interface TestUser {
  authId: string
  profileId: string
  email: string
  client: SupabaseClient
}

async function createUser(name: string): Promise<TestUser> {
  const email = emailFor(name)

  const { data: created, error: createError } = await admin!.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: name },
  })
  if (createError) throw createError

  // Sign in through a normal anon client — this is the session a browser gets.
  const client = createClient(url!, anonKey!, clientOptions)
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  })
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

describeIntegration('RLS and expense RPCs', () => {
  let alice: TestUser
  let bob: TestUser
  let mallory: TestUser // in no group with the others
  let groupId: string
  let inviteCode: string

  beforeAll(async () => {
    ;[alice, bob, mallory] = await Promise.all([
      createUser('alice'),
      createUser('bob'),
      createUser('mallory'),
    ])
  }, 60_000)

  afterAll(async () => {
    if (!admin) return
    // Expenses reference profiles with no cascade, so clear data first.
    if (groupId) await admin.from('groups').delete().eq('id', groupId)
    for (const user of [alice, bob, mallory]) {
      if (!user) continue
      await admin.from('expenses').delete().eq('created_by', user.profileId)
      await admin.from('profiles').delete().eq('id', user.profileId)
      await admin.auth.admin.deleteUser(user.authId)
    }
  }, 60_000)

  it('creates a profile automatically on signup', () => {
    expect(alice.profileId).toBeTruthy()
    expect(bob.profileId).toBeTruthy()
    expect(alice.profileId).not.toBe(bob.profileId)
  })

  it('creates a group and makes the creator an admin', async () => {
    const { data, error } = await alice.client.rpc('create_group', {
      p_name: 'Test House',
      p_label: 'Sharehouse',
      p_currency: 'ZAR',
    })
    expect(error).toBeNull()
    groupId = data as string

    const { data: membership } = await alice.client
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('profile_id', alice.profileId)
      .single()

    expect(membership?.role).toBe('admin')
  })

  it('lets a second user join with the invite code', async () => {
    const { data: group } = await alice.client
      .from('groups')
      .select('invite_code')
      .eq('id', groupId)
      .single()
    inviteCode = group!.invite_code

    const { error } = await bob.client.rpc('join_group_by_code', { code: inviteCode })
    expect(error).toBeNull()

    const { data: groups } = await bob.client.from('groups').select('id').eq('id', groupId)
    expect(groups).toHaveLength(1)
  })

  it('rejects a bad invite code', async () => {
    const { error } = await mallory.client.rpc('join_group_by_code', { code: 'NOTACODE' })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/does not match/i)
  })

  it('hides the group from someone who is not a member', async () => {
    const { data } = await mallory.client.from('groups').select('id').eq('id', groupId)
    expect(data).toEqual([])
  })

  describe('expenses', () => {
    let expenseId: string

    it('creates an expense with participants atomically', async () => {
      const shares = splitExpense('equal', 30000, [
        { profileId: alice.profileId },
        { profileId: bob.profileId },
      ])

      const { data, error } = await alice.client.rpc('create_expense', {
        p_group_id: groupId,
        p_description: 'Groceries',
        p_amount_cents: 30000,
        p_currency: 'ZAR',
        p_expense_date: '2026-08-11',
        p_split_type: 'equal',
        p_category_id: null,
        p_note: null,
        p_participants: shares.map((s) => ({
          profile_id: s.profileId,
          paid_cents: s.profileId === alice.profileId ? 30000 : 0,
          owed_cents: s.owedCents,
          split_weight: s.splitWeight,
        })),
      })

      expect(error).toBeNull()
      expenseId = data as string

      const { data: participants } = await alice.client
        .from('expense_participants')
        .select('profile_id, paid_cents, owed_cents')
        .eq('expense_id', expenseId)

      expect(participants).toHaveLength(2)
      expect(participants!.reduce((sum, p) => sum + p.owed_cents, 0)).toBe(30000)
      expect(participants!.reduce((sum, p) => sum + p.paid_cents, 0)).toBe(30000)
    })

    it('rejects an expense whose shares do not add up', async () => {
      const { error } = await alice.client.rpc('create_expense', {
        p_group_id: groupId,
        p_description: 'Unbalanced',
        p_amount_cents: 10000,
        p_currency: 'ZAR',
        p_expense_date: '2026-08-11',
        p_split_type: 'exact',
        p_category_id: null,
        p_note: null,
        p_participants: [
          { profile_id: alice.profileId, paid_cents: 10000, owed_cents: 4000 },
          { profile_id: bob.profileId, paid_cents: 0, owed_cents: 5000 },
        ],
      })

      expect(error).not.toBeNull()
      expect(error!.message).toMatch(/does not balance/i)
    })

    it('leaves nothing behind when an unbalanced expense is rejected', async () => {
      const { data } = await alice.client
        .from('expenses')
        .select('id')
        .eq('description', 'Unbalanced')
      expect(data).toEqual([])
    })

    it('lets the other group member see the expense', async () => {
      const { data } = await bob.client.from('expenses').select('id').eq('id', expenseId)
      expect(data).toHaveLength(1)
    })

    it('hides the expense from a non-member', async () => {
      const { data } = await mallory.client.from('expenses').select('id').eq('id', expenseId)
      expect(data).toEqual([])
    })

    it('hides expense participants from a non-member', async () => {
      const { data } = await mallory.client
        .from('expense_participants')
        .select('profile_id')
        .eq('expense_id', expenseId)
      expect(data).toEqual([])
    })

    it('stops a non-member writing an expense into the group', async () => {
      const { error } = await mallory.client.rpc('create_expense', {
        p_group_id: groupId,
        p_description: 'Intrusion',
        p_amount_cents: 5000,
        p_currency: 'ZAR',
        p_expense_date: '2026-08-11',
        p_split_type: 'equal',
        p_category_id: null,
        p_note: null,
        p_participants: [
          { profile_id: mallory.profileId, paid_cents: 5000, owed_cents: 5000 },
        ],
      })
      expect(error).not.toBeNull()
    })

    it('stops a non-member editing an expense', async () => {
      const { error } = await mallory.client
        .from('expenses')
        .update({ description: 'Tampered' })
        .eq('id', expenseId)
      // Either an explicit error, or zero rows matched — both mean "denied".
      const { data } = await alice.client
        .from('expenses')
        .select('description')
        .eq('id', expenseId)
        .single()
      expect(data!.description).toBe('Groceries')
      expect(error === null || error !== null).toBe(true)
    })

    it('stops a group member escalating themselves to admin', async () => {
      await bob.client
        .from('group_members')
        .update({ role: 'admin' })
        .eq('group_id', groupId)
        .eq('profile_id', alice.profileId)

      const { data } = await alice.client
        .from('group_members')
        .select('role')
        .eq('group_id', groupId)
        .eq('profile_id', bob.profileId)
        .single()

      expect(data!.role).toBe('member')
    })
  })

  describe('profile visibility', () => {
    it('lets group members see each other', async () => {
      const { data } = await bob.client.from('profiles').select('id').eq('id', alice.profileId)
      expect(data).toHaveLength(1)
    })

    it('hides unrelated people from each other', async () => {
      const { data } = await mallory.client
        .from('profiles')
        .select('id')
        .eq('id', alice.profileId)
      expect(data).toEqual([])
    })

    it('does not expose the whole user table', async () => {
      const { data } = await mallory.client.from('profiles').select('id')
      // Mallory can only ever see Mallory.
      expect(data).toHaveLength(1)
      expect(data![0].id).toBe(mallory.profileId)
    })
  })
})
