import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/services/session'
import { Avatar, Card, PageShell } from '@/components/ui'
import SignOutButton from './SignOutButton'

export const dynamic = 'force-dynamic'

export default async function AccountPage() {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/auth')

  return (
    <PageShell title="Account" nav="account">
      <Card className="flex items-center gap-4 p-5">
        <Avatar name={profile.display_name} url={profile.avatar_url} size={56} />
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{profile.display_name}</p>
          <p className="truncate text-sm text-muted">{profile.email}</p>
          {profile.username && (
            <p className="truncate text-sm text-muted">@{profile.username}</p>
          )}
        </div>
      </Card>

      <Card className="mt-3 divide-y divide-edge">
        <div className="flex items-center justify-between p-4">
          <span className="text-sm text-muted">Default currency</span>
          <span className="text-sm font-medium">{profile.default_currency}</span>
        </div>
      </Card>

      <SignOutButton />
    </PageShell>
  )
}
