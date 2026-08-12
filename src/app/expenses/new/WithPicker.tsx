'use client'

import { useState } from 'react'
import { Avatar } from '@/components/ui'
import type { Member } from './SplitChooser'

export interface GroupOption {
  id: string
  name: string
  avatarUrl: string | null
  memberCount: number
}

/**
 * Who this expense is with — asked first, before anything else.
 *
 * The form used to open with every friend you have already in the split, and
 * the only way to narrow it down was buried inside the split screen. That is
 * backwards: who you are splitting with is the first thing you know and the
 * thing that decides everything after it, so it is now the first thing you say.
 *
 * A group or some friends, never both: a group already names its members, and
 * an expense that is half in a group is not a thing the schema has.
 */
export default function WithPicker({
  groups,
  friends,
  groupId,
  withIds,
  onApply,
  open,
  onClose,
  canClose,
  hideGroups = false,
}: {
  groups: GroupOption[]
  friends: Member[]
  groupId: string | null
  withIds: string[]
  onApply: (next: { groupId: string | null; withIds: string[] }) => void
  open: boolean
  onClose: () => void
  /** False on first open, when there is nothing to go back to. */
  canClose: boolean
  /**
   * Hidden while editing: `update_expense` cannot change an expense's group, so
   * offering one would be a promise the save could not keep.
   */
  hideGroups?: boolean
}) {
  const [chosen, setChosen] = useState<string[]>(withIds)

  if (!open) return null

  function toggle(id: string) {
    setChosen((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    )
  }

  const showGroups = !hideGroups && groups.length > 0
  const nothingToPick = !showGroups && friends.length === 0

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface">
      <header className="flex items-center justify-between border-b border-edge px-4 py-4">
        {canClose ? (
          <button
            type="button"
            onClick={onClose}
            className="w-20 text-left text-sm font-medium text-accent"
          >
            Cancel
          </button>
        ) : (
          <span className="w-20" />
        )}
        <h2 className="text-base font-semibold">Split with</h2>
        <span className="w-20" />
      </header>

      <div className="flex-1 overflow-y-auto">
        {nothingToPick && (
          <div className="p-5">
            <div className="rounded-2xl border border-dashed border-edge p-5 text-sm text-muted">
              <p className="font-medium text-ink">There&rsquo;s nobody to split with yet.</p>
              <p className="mt-1">
                Add a friend or create a group, then come back and add this expense.
              </p>
            </div>
          </div>
        )}

        {showGroups && (
          <section>
            <h3 className="px-5 pb-2 pt-4 text-sm font-semibold uppercase tracking-wider text-muted">
              Groups
            </h3>
            <ul className="divide-y divide-edge border-y border-edge">
              {groups.map((group) => (
                <li key={group.id}>
                  <button
                    type="button"
                    onClick={() => onApply({ groupId: group.id, withIds: [] })}
                    className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-raised"
                  >
                    <Avatar name={group.name} url={group.avatarUrl} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-medium">{group.name}</span>
                      <span className="block text-sm text-muted">
                        {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
                      </span>
                    </span>
                    {groupId === group.id && (
                      <span aria-hidden className="text-lg text-accent">
                        ✓
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {friends.length > 0 && (
          <section>
            <h3 className="px-5 pb-2 pt-4 text-sm font-semibold uppercase tracking-wider text-muted">
              Friends
            </h3>
            <ul className="divide-y divide-edge border-y border-edge">
              {friends.map((friend) => {
                const picked = chosen.includes(friend.id)
                return (
                  <li key={friend.id}>
                    <button
                      type="button"
                      onClick={() => toggle(friend.id)}
                      aria-pressed={picked}
                      className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-raised"
                    >
                      <Avatar name={friend.name} url={friend.avatarUrl} size={40} />
                      <span className="min-w-0 flex-1 truncate text-base font-medium">
                        {friend.name}
                      </span>
                      <span
                        aria-hidden
                        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-sm ${
                          picked
                            ? 'border-accent bg-accent text-white'
                            : 'border-edge text-transparent'
                        }`}
                      >
                        ✓
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
            <p className="px-5 py-3 text-sm text-muted">
              Pick as many as you like. You are always included.
            </p>
          </section>
        )}
      </div>

      <div className="border-t border-edge p-4">
        <button
          type="button"
          onClick={() => onApply({ groupId: null, withIds: chosen })}
          disabled={chosen.length === 0}
          className="w-full rounded-xl bg-accent px-4 py-3.5 font-semibold text-white transition-opacity disabled:opacity-40"
        >
          {chosen.length === 0
            ? 'Choose who to split with'
            : `Split with ${chosen.length} ${chosen.length === 1 ? 'person' : 'people'}`}
        </button>
        <div style={{ height: 'env(safe-area-inset-bottom)' }} />
      </div>
    </div>
  )
}
