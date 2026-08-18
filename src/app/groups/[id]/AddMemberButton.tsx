'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { addGroupMemberAction } from '@/app/actions'
import { Avatar } from '@/components/ui'

export interface AddableFriend {
  profileId: string
  displayName: string
  avatarUrl: string | null
}

/**
 * Add friends to a group.
 *
 * Anyone who is not yet on Homeslice gets the invite code instead of a
 * stand-in profile: there is no longer such a thing as a person without an
 * account, so the honest answer to "they haven't signed up" is "get them to".
 */
export default function AddMemberButton({
  groupId,
  friends,
  inviteCode,
}: {
  groupId: string
  friends: AddableFriend[]
  inviteCode: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const needle = query.trim().toLowerCase()
  const matches = needle
    ? friends.filter((friend) => friend.displayName.toLowerCase().includes(needle))
    : friends

  function close() {
    setOpen(false)
    setError(null)
    setQuery('')
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

        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted">
            Your friends
          </h3>

          {friends.length === 0 ? (
            <p className="rounded-2xl border border-edge px-4 py-5 text-center text-sm text-muted">
              Everyone you are friends with is already in this group.
            </p>
          ) : (
            <>
              {friends.length > 6 && (
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search friends"
                  autoCapitalize="none"
                  className="mb-2 h-14 w-full rounded-xl border border-edge bg-raised px-4 text-base outline-none focus:border-accent"
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
                        <Avatar name={friend.displayName} url={friend.avatarUrl} size={36} />
                        <p className="min-w-0 flex-1 truncate text-sm font-medium">
                          {friend.displayName}
                        </p>
                        <span className="text-sm font-semibold text-accent">
                          {busyId === friend.profileId ? 'Adding…' : 'Add'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted">
            Someone not on Homeslice
          </h3>
          <div className="rounded-2xl border border-edge p-4">
            <p className="text-sm text-muted">
              They need an account of their own. Send them this code — joining with it puts them
              straight into the group.
            </p>
            <p className="mt-3 select-all rounded-xl bg-raised px-4 py-3 text-center text-xl font-bold tracking-[0.3em]">
              {inviteCode}
            </p>
          </div>
        </section>

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
