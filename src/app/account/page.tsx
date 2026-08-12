import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/services/session'
import { Avatar, Card, PageShell } from '@/components/ui'
import SignOutButton from './SignOutButton'
import UsernameField from './UsernameField'
import ProfileFields from './ProfileFields'

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
        </div>
      </Card>

      <Card className="mt-3 divide-y divide-edge">
        <UsernameField current={profile.username} />
        <ProfileFields
          displayName={profile.display_name}
          defaultCurrency={profile.default_currency}
        />
      </Card>

      {!profile.username && (
        <p className="mt-3 px-1 text-sm text-muted">
          Pick a username so friends can add you without swapping email addresses.
        </p>
      )}

      <SignOutButton />
    </PageShell>
  )
}
