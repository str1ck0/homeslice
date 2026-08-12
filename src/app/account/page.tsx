import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/services/session'
import { Card, PageShell } from '@/components/ui'
import AvatarPicker from '@/components/AvatarPicker'
import { setAvatarAction } from '@/app/actions'
import SignOutButton from './SignOutButton'
import ProfileFields from './ProfileFields'

export const dynamic = 'force-dynamic'

export default async function AccountPage() {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/auth')

  return (
    <PageShell title="Account" nav="account">
      <Card className="flex flex-col gap-4 p-5">
        <AvatarPicker
          name={profile.display_name}
          url={profile.avatar_url}
          size={72}
          onSave={setAvatarAction}
        />
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{profile.display_name}</p>
          <p className="truncate text-sm text-muted">{profile.email}</p>
        </div>
      </Card>

      <Card className="mt-3 divide-y divide-edge">
        <ProfileFields
          displayName={profile.display_name}
          defaultCurrency={profile.default_currency}
        />
      </Card>


      <SignOutButton />
    </PageShell>
  )
}
