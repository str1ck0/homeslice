import { config } from 'dotenv'

// Integration tests need the project credentials that live in .env.local.
config({ path: '.env.local' })

/**
 * Refuse to run against anything but the local stack.
 *
 * These tests create users, write rows and assert on RLS by trying things that
 * are supposed to fail. Pointed at the hosted project they would do all of
 * that to real people's records — and for a while they did, which is why
 * production has thirteen profiles behind four real logins.
 *
 * The escape hatch is deliberately ugly to type and deliberately not a flag
 * anyone would reach for by habit. If you use it, you have decided to write to
 * production on purpose.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(new URL(url || 'http://x').origin)

if (!url) {
  throw new Error(
    'No NEXT_PUBLIC_SUPABASE_URL. Start the local stack with `supabase start`, ' +
      'then check .env.local points at http://127.0.0.1:54321.'
  )
}

if (!isLocal && process.env.I_REALLY_MEAN_PRODUCTION !== 'yes') {
  throw new Error(
    `Refusing to run integration tests against ${url}.\n` +
      'These tests create users and write rows. They belong on the local stack:\n' +
      '  supabase start && npm run test:integration\n' +
      'To override anyway, set I_REALLY_MEAN_PRODUCTION=yes.'
  )
}
