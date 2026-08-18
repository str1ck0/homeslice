'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function SignOutButton() {
  const router = useRouter()

  async function signOut() {
    await createClient().auth.signOut()
    router.push('/auth')
    router.refresh()
  }

  return (
    <button
      onClick={signOut}
      className="mt-6 w-full rounded-xl border border-edge py-3 text-sm font-semibold text-negative transition-colors hover:border-negative"
    >
      Sign out
    </button>
  )
}
