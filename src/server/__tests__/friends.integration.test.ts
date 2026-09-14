/**
 * Friend requests, and the rules that make a request mean something.
 *
 * Before 20260914000000 adding someone by name made you their friend on the
 * spot, and a friend could put you in an expense. Names are easy to guess and
 * sign-ups are open, so anyone could put a debt on anyone's dashboard — and
 * read their email address while they were at it.
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

const orderedPair = (x: string, y: string) => (x < y ? [x, y] : [y, x])

const describeIntegration = hasCredentials ? describe : describe.skip

describeIntegration('friend requests', () => {
  let sam: TestUser
  let ria: TestUser
  let max: TestUser

  beforeAll(async () => {
    ;[sam, ria, max] = await Promise.all([
      createUser('sam'),
      createUser('ria'),
      createUser('max'),
    ])
  }, 60_000)

  afterAll(async () => {
    if (!admin) return
    const ids = [sam, ria, max].filter(Boolean).map((u) => u.profileId)
    await admin.from('expenses').delete().in('created_by', ids)
    await admin.from('settlements').delete().in('created_by', ids)
    await admin.from('friendships').delete().in('profile_a', ids)
    await admin.from('friendships').delete().in('profile_b', ids)
    await admin.from('profiles').delete().in('id', ids)
    for (const user of [sam, ria, max]) {
      if (user) await admin.auth.admin.deleteUser(user.authId)
    }
  }, 60_000)

  async function friendship(x: TestUser, y: TestUser) {
    const [a, b] = orderedPair(x.profileId, y.profileId)
    const { data } = await admin!
      .from('friendships')
      .select('status, requested_by')
      .eq('profile_a', a)
      .eq('profile_b', b)
      .maybeSingle()
    return data
  }

  function splitDinner(creator: TestUser, other: TestUser) {
    return creator.client.rpc('create_expense', {
      p_group_id: null,
      p_description: `Dinner ${stamp}`,
      p_amount_cents: 1000,
      p_currency: 'ZAR',
      p_expense_date: null,
      p_split_type: 'equal',
      p_category_id: null,
      p_note: null,
      p_participants: [
        { profile_id: creator.profileId, paid_cents: 1000, owed_cents: 500 },
        { profile_id: other.profileId, paid_cents: 0, owed_cents: 500 },
      ],
    })
  }

  it('sends a request rather than making a friendship', async () => {
    const { data, error } = await sam.client.rpc('add_friend', { p_name: ria.displayName })

    expect(error).toBeNull()
    expect(data).toBe(ria.profileId)
    expect(await friendship(sam, ria)).toEqual({
      status: 'pending',
      requested_by: sam.profileId,
    })
  })

  it('will not let the person who asked accept their own request', async () => {
    const { error } = await sam.client.rpc('accept_friend', { p_profile_id: ria.profileId })

    expect(error).not.toBeNull()
    expect((await friendship(sam, ria))!.status).toBe('pending')
  })

  it('will not let anyone write a friendship directly', async () => {
    const [a, b] = orderedPair(max.profileId, sam.profileId)
    const { error: insertError } = await max.client
      .from('friendships')
      .insert({ profile_a: a, profile_b: b, status: 'accepted' })
    expect(insertError).not.toBeNull()
    expect(await friendship(max, sam)).toBeNull()

    const [c, d] = orderedPair(sam.profileId, ria.profileId)
    const { error: updateError } = await sam.client
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('profile_a', c)
      .eq('profile_b', d)
    expect(updateError).not.toBeNull()
    expect((await friendship(sam, ria))!.status).toBe('pending')
  })

  it('will not let someone put a person in an expense before they accept', async () => {
    const { data, error } = await splitDinner(sam, ria)

    expect(data).toBeNull()
    expect(error!.message).toMatch(/accepted/i)

    const { data: left } = await admin!
      .from('expenses')
      .select('id')
      .eq('description', `Dinner ${stamp}`)
    expect(left ?? []).toEqual([])
  })

  it('will not let someone record a payment with them before they accept', async () => {
    // "Ria paid Sam R500" would leave Ria owing money she never agreed to.
    const { error } = await sam.client.from('settlements').insert({
      group_id: null,
      from_profile: ria.profileId,
      to_profile: sam.profileId,
      amount_cents: 50000,
      currency: 'ZAR',
      created_by: sam.profileId,
    })

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/accepted/i)
  })

  it('lets the person asked accept, and then they can split', async () => {
    const { error } = await ria.client.rpc('accept_friend', { p_profile_id: sam.profileId })
    expect(error).toBeNull()
    expect((await friendship(sam, ria))!.status).toBe('accepted')

    const { error: splitError } = await splitDinner(sam, ria)
    expect(splitError).toBeNull()
  })

  it('treats asking someone who already asked you as saying yes', async () => {
    await max.client.rpc('add_friend', { p_name: sam.displayName })
    expect((await friendship(max, sam))!.status).toBe('pending')

    const { error } = await sam.client.rpc('add_friend', { p_name: max.displayName })
    expect(error).toBeNull()
    expect((await friendship(max, sam))!.status).toBe('accepted')
  })

  it('lets the person asked decline', async () => {
    await ria.client.rpc('add_friend', { p_name: max.displayName })
    const [a, b] = orderedPair(ria.profileId, max.profileId)

    const { data, error } = await max.client
      .from('friendships')
      .delete()
      .eq('profile_a', a)
      .eq('profile_b', b)
      .eq('status', 'pending')
      .select('id')

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(await friendship(ria, max)).toBeNull()
  })

  it("does not hand out anybody's email address, even to a friend", async () => {
    const { error } = await sam.client.from('profiles').select('email').eq('id', ria.profileId)
    expect(error).not.toBeNull()

    // Everything else about a friend is still readable.
    const { data, error: nameError } = await sam.client
      .from('profiles')
      .select('id, display_name, avatar_url')
      .eq('id', ria.profileId)
    expect(nameError).toBeNull()
    expect(data).toHaveLength(1)
  })
})
