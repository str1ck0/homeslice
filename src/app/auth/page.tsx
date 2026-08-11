import { Suspense } from 'react'
import AuthForm from './AuthForm'

export default function AuthPage() {
  return (
    // useSearchParams needs a boundary so the shell can be prerendered while
    // the query string is resolved on the client.
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-dvh max-w-sm items-center justify-center px-6">
          <p className="text-sm text-muted">Loading…</p>
        </div>
      }
    >
      <AuthForm />
    </Suspense>
  )
}
