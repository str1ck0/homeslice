'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { removeGroupMemberAction, leaveGroupAction } from '@/app/actions'
import { Avatar, Card } from '@/components/ui'

export interface MemberRow {
  profileId: string
  displayName: string
  avatarUrl: string | null
  role: string
  isPlaceholder: boolean
}

/**
 * The members list, with a way back out of it.
 *
 * Removing someone sets `left_at` rather than deleting the row, so their
 * expenses and the balances that came from them survive. The service refuses
 * while they are unsettled; the error it returns is shown inline on their row,
 * because "settle up first" is only useful next to the person it is about.
 */
export default function MemberList({
  groupId,
  members,
  currentProfileId,
  isAdmin,
}: {
  groupId: string
  members: MemberRow[]
  currentProfileId: string
  isAdmin: boolean
}) {
  const router = useRouter()
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [errorFor, setErrorFor] = useState<{ id: string; message: string } | null>(null)

  async function remove(profileId: string) {
    setBusyId(profileId)
    setErrorFor(null)

    const leaving = profileId === currentProfileId
    const result = leaving
      ? await leaveGroupAction(groupId)
      : await removeGroupMemberAction(groupId, profileId)

    // Leaving redirects on success, so anything returned means it failed.
    if (result && !result.ok) {
      setErrorFor({ id: profileId, message: result.error ?? 'Could not remove them' })
      setBusyId(null)
      return
    }

    setBusyId(null)
    setConfirmingId(null)
    if (!leaving) router.refresh()
  }

  return (
    <Card className="divide-y divide-edge">
      {members.map((member) => {
        const isMe = member.profileId === currentProfileId
        const canRemove = isMe || isAdmin
        const confirming = confirmingId === member.profileId
        const error = errorFor?.id === member.profileId ? errorFor.message : null

        return (
          <div key={member.profileId} className="p-4">
            <div className="flex items-center gap-3">
              <Avatar name={member.displayName} url={member.avatarUrl} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {member.displayName}
                  {isMe && <span className="ml-1.5 text-muted">(you)</span>}
                </p>
                {member.isPlaceholder && (
                  <p className="text-xs text-muted">Hasn&rsquo;t signed up yet</p>
                )}
              </div>

              {member.role === 'admin' && (
                <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
                  Admin
                </span>
              )}

              {canRemove && !confirming && (
                <button
                  onClick={() => {
                    setConfirmingId(member.profileId)
                    setErrorFor(null)
                  }}
                  className="text-sm font-medium text-muted transition-colors hover:text-negative"
                >
                  {isMe ? 'Leave' : 'Remove'}
                </button>
              )}
            </div>

            {confirming && (
              <div className="mt-3 rounded-xl border border-edge bg-surface p-3">
                <p className="text-sm text-muted">
                  {isMe
                    ? 'Leave this group? Expenses you are part of stay, and so do their balances.'
                    : `Remove ${member.displayName}? Their expenses stay, and so do their balances.`}
                </p>

                {error && (
                  <p role="alert" className="mt-2 text-sm font-medium text-negative">
                    {error}
                  </p>
                )}

                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => remove(member.profileId)}
                    disabled={busyId !== null}
                    className="rounded-xl bg-negative px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {busyId === member.profileId
                      ? isMe
                        ? 'Leaving…'
                        : 'Removing…'
                      : isMe
                        ? 'Leave group'
                        : 'Remove'}
                  </button>
                  <button
                    onClick={() => {
                      setConfirmingId(null)
                      setErrorFor(null)
                    }}
                    className="rounded-xl border border-edge px-4 py-2 text-sm font-semibold text-muted"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </Card>
  )
}
