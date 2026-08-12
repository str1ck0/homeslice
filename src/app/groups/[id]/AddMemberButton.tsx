'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { addGroupMemberAction, addPlaceholderAction } from '@/app/actions'
import { Avatar } from '@/components/ui'

export interface AddableFriend {
  profileId: string
  displayName: string
  username: string | null
  isPlaceholder: boolean
}

/**
 * Add people to a group: your existing friends first, and a new person second.
 *
 * The old version only offered "add someone who hasn't signed up", so the one
 * thing you actually want most of the time — put a friend you already have in
 * this group — was impossible without making a duplicate of them.
 */
export default function AddMemberButton({
  groupId,
  friends,
}: {
  groupId: string
  friends: AddableFriend[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [showNewPerson, setShowNewPerson] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const needle = query.trim().toLowerCase()
  const matches = needle
    ? friends.filter(
        (friend) =>
          friend.displayName.toLowerCase().includes(needle) ||
          friend.username?.toLowerCase().includes(needle)
      )
    : friends

  function close() {
    setOpen(false)
    setError(null)
    setQuery('')
    setShowNewPerson(false)
  }

  async function addFriend(profileId: string) {
    setBusyId(profileId)
    setError(null)

    const result = await addGroupMemberAction(groupId, profileId)
    setBusyId(null)

    if (!result.ok) {
      setError(result.error ?? 'Could not add them')
      return
    }

    router.refresh()
  }

  async function addNewPerson(event: React.FormEvent) {
    event.preventDefault()
    setBusyId('new')
    setError(null)

    const result = await addPlaceholderAction(groupId, name, email || undefined)
    setBusyId(null)

    if (!result.ok) {
      setError(result.error ?? 'Could not add them')
      return
    }

    setName('')
    setEmail('')
    setShowNewPerson(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 w-full rounded-xl border border-edge py-3 text-sm font-semibold text-accent transition-colors hover:border-accent"
      >
        Add people
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface">
      <header className="flex items-center justify-between border-b border-edge px-4 py-4">
        <button onClick={close} aria-label="Close" className="w-16 text-left text-2xl leading-none">
          ×
        </button>
        <h2 className="text-base font-semibold">Add people</h2>
        <span className="w-16" />
      </header>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-5">
        {error && (
          <p role="alert" className="rounded-xl bg-negative/10 px-4 py-3 text-sm text-negative">
            {error}
          </p>
        )}

        {friends.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted">
              Your friends
            </h3>

            {friends.length > 6 && (
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search friends"
                autoCapitalize="none"
                className="mb-2 w-full rounded-xl border border-edge bg-raised px-4 py-3 text-base outline-none focus:border-accent"
              />
            )}

            {matches.length === 0 ? (
              <p className="px-1 py-3 text-sm text-muted">Nobody by that name.</p>
            ) : (
              <ul className="divide-y divide-edge overflow-hidden rounded-2xl border border-edge">
                {matches.map((friend) => (
                  <li key={friend.profileId}>
                    <button
                      onClick={() => addFriend(friend.profileId)}
                      disabled={busyId !== null}
                      className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-raised disabled:opacity-50"
                    >
                      <Avatar name={friend.displayName} url={null} size={36} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{friend.displayName}</p>
                        {friend.username ? (
                          <p className="truncate text-xs text-muted">@{friend.username}</p>
                        ) : friend.isPlaceholder ? (
                          <p className="text-xs text-muted">Hasn&rsquo;t signed up yet</p>
                        ) : null}
                      </div>
                      <span className="text-sm font-semibold text-accent">
                        {busyId === friend.profileId ? 'Adding…' : 'Add'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section>
          {!showNewPerson ? (
            <button
              onClick={() => setShowNewPerson(true)}
              className="w-full rounded-xl border border-edge py-3 text-sm font-semibold text-accent transition-colors hover:border-accent"
            >
              {friends.length > 0 ? 'Someone not in your friends' : 'Add someone new'}
            </button>
          ) : (
            <form
              onSubmit={addNewPerson}
              className="flex flex-col gap-3 rounded-2xl border border-edge bg-raised p-4"
            >
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Their name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  autoFocus
                  maxLength={80}
                  placeholder="Mum"
                  className="rounded-xl border border-edge bg-surface px-4 py-3 text-base outline-none focus:border-accent"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">
                  Their email <span className="font-normal text-muted">Optional</span>
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="mum@example.com"
                  className="rounded-xl border border-edge bg-surface px-4 py-3 text-base outline-none focus:border-accent"
                />
                <span className="text-xs text-muted">
                  If they sign up with this address later, they take over this person and keep
                  the history.
                </span>
              </label>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={busyId !== null}
                  className="flex-1 rounded-xl bg-accent px-4 py-3 font-semibold text-white disabled:opacity-50"
                >
                  {busyId === 'new' ? 'Adding…' : 'Add them'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewPerson(false)}
                  className="rounded-xl border border-edge px-4 py-3 font-semibold text-muted"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </section>

        <p className="text-center text-sm text-muted text-balance">
          Nothing is sent to them — Homeslice doesn&rsquo;t email anyone. Share the invite code
          yourself when you like.
        </p>

        <div className="mt-auto">
          <button
            onClick={close}
            className="w-full rounded-xl border border-edge px-4 py-3.5 font-semibold text-muted"
          >
            Done
          </button>
          <div style={{ height: 'env(safe-area-inset-bottom)' }} />
        </div>
      </div>
    </div>
  )
}
