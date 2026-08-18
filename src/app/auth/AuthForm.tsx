'use client'

import { useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Mode = 'signin' | 'signup' | 'magic' | 'forgot'

export default function AuthForm() {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get('next') ?? '/dashboard'

  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  // Held true through the navigation that follows a success, so the button
  // never flips back to "Sign in" over a page that is still loading.
  const [succeeded, setSucceeded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const submitting = useRef(false)

  const supabase = createClient()

  /** Where to land, carrying a flag so the destination can confirm it worked. */
  function destination(): string {
    const [path, query] = next.split('?')
    const search = new URLSearchParams(query ?? '')
    search.set('welcome', '1')
    return `${path}?${search.toString()}`
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (submitting.current) return
    submitting.current = true

    setBusy(true)
    setError(null)
    setNotice(null)

    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        setSucceeded(true)
        router.push(destination())
        router.refresh()
        return
      }

      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: displayName || email.split('@')[0] } },
        })
        if (error) throw error
        setSucceeded(true)
        router.push(destination())
        router.refresh()
        return
      }

      if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        })
        if (error) throw error
        setNotice('Check your email for a sign-in link.')
        return
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        // Cookie sessions use the PKCE flow, so the link returns a ?code that
        // must be exchanged before a session exists. Routing through the
        // callback does that, then hands off to the reset form. Pointing
        // straight at /reset-password leaves it with no session and no way in.
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      })
      if (error) throw error
      setNotice('Check your email for a reset link.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work')
      setBusy(false)
      submitting.current = false
      return
    }

    // Only the email modes reach here having finished: the password modes
    // returned above and are still navigating.
    setBusy(false)
    submitting.current = false
  }

  const copy = {
    signin: { title: 'Welcome back', cta: 'Sign in' },
    signup: { title: 'Create your account', cta: 'Create account' },
    magic: { title: 'Sign in by email', cta: 'Send me a link' },
    forgot: { title: 'Reset your password', cta: 'Send reset link' },
  }[mode]

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-12">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-widest text-accent">Homeslice</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-balance">{copy.title}</h1>
        <p className="mt-2 text-sm text-muted">
          Split costs and run your house. Free, for good.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {mode === 'signup' && (
          <>
            <Field
              label="Your name"
              value={displayName}
              onChange={setDisplayName}
              autoComplete="name"
              maxLength={40}
              placeholder="John Smith"
            />
            {/* Worth saying up front: this is the one identity, and it is how
                people find you. It can be changed later. */}
            <p className="-mt-2 text-xs text-muted">
              This is what people see and what they type to add you, so it has to be unique.
              Anything you like — your name, or a handle. You can change it later.
            </p>
          </>
        )}

        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          required
          placeholder="you@example.com"
        />

        {(mode === 'signin' || mode === 'signup') && (
          <Field
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            required
            minLength={8}
          />
        )}

        {error && (
          <p role="alert" className="rounded-xl bg-negative/10 px-4 py-3 text-sm text-negative">
            {error}
          </p>
        )}
        {notice && (
          <p className="rounded-xl bg-accent/10 px-4 py-3 text-sm text-accent">{notice}</p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3.5 font-semibold text-white transition-opacity disabled:opacity-50"
        >
          {busy && <Spinner />}
          {succeeded ? 'Signed in' : busy ? 'Just a moment…' : copy.cta}
        </button>
      </form>

      <div className="mt-6 flex flex-col gap-2 text-sm">
        {mode !== 'signin' && (
          <button onClick={() => setMode('signin')} className="text-muted hover:text-ink">
            Already have an account? <span className="text-accent">Sign in</span>
          </button>
        )}
        {mode !== 'signup' && (
          <button onClick={() => setMode('signup')} className="text-muted hover:text-ink">
            New here? <span className="text-accent">Create an account</span>
          </button>
        )}
        {mode !== 'magic' && (
          <button onClick={() => setMode('magic')} className="text-muted hover:text-ink">
            <span className="text-accent">Email me a link</span> instead
          </button>
        )}
        {mode !== 'forgot' && mode === 'signin' && (
          <button onClick={() => setMode('forgot')} className="text-muted hover:text-ink">
            Forgot your password?
          </button>
        )}
      </div>
    </div>
  )
}

/** A plain CSS spinner — no icon dependency for one shape. */
function Spinner() {
  return (
    <span
      aria-hidden
      className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/40 border-t-white"
    />
  )
}

function Field({
  label,
  value,
  onChange,
  ...props
}: {
  label: string
  value: string
  onChange: (value: string) => void
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <input
        {...props}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-14 rounded-xl border border-edge bg-raised px-4 text-base outline-none transition-colors focus:border-accent"
      />
    </label>
  )
}
