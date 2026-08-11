'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const router = useRouter()
  const supabase = createClient()

  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Supabase fires PASSWORD_RECOVERY once it has consumed the link's token.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setReady(true)
    })

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true)
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (password !== confirm) {
      setError('Those two passwords do not match')
      return
    }

    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)

    if (error) {
      setError(error.message)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-bold tracking-tight">Choose a new password</h1>

      {!ready ? (
        <p className="mt-4 text-sm text-muted">
          Open this page from the reset link in your email.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">New password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="rounded-xl border border-edge bg-raised px-4 py-3 text-base outline-none focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Confirm it</span>
            <input
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="rounded-xl border border-edge bg-raised px-4 py-3 text-base outline-none focus:border-accent"
            />
          </label>

          {error && (
            <p role="alert" className="rounded-xl bg-negative/10 px-4 py-3 text-sm text-negative">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-2 rounded-xl bg-accent px-4 py-3.5 font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save password'}
          </button>
        </form>
      )}
    </div>
  )
}
