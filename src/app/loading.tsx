import LoadingNav from '@/components/LoadingNav'

/**
 * Shown the instant a page is asked for, while the server is still fetching.
 *
 * Every signed-in page is rendered fresh and waits on several trips to the
 * database before it has anything to send. Without this, opening the installed
 * app was a blank screen for all of that, and tapping a tab did nothing visible
 * until the next page arrived whole. Next.js sends this first and swaps the
 * real page in when it is ready.
 *
 * Shaped like PageShell — a title, a balance card, a few rows — so the page
 * lands where the placeholder already was instead of jumping.
 */
export default function Loading() {
  return (
    <div
      className="mx-auto flex min-h-app max-w-lg flex-col"
      style={{ paddingBottom: 'calc(5.25rem + env(safe-area-inset-bottom))' }}
      aria-busy="true"
      aria-label="Loading"
    >
      <header className="px-5 pb-4 pt-8">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-edge" />
      </header>
      <main className="flex flex-1 flex-col gap-2 px-5">
        <div className="mb-4 h-28 animate-pulse rounded-2xl border border-edge bg-raised" />
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-[72px] animate-pulse rounded-2xl border border-edge bg-raised"
            style={{ animationDelay: `${i * 120}ms` }}
          />
        ))}
      </main>
      <LoadingNav />
    </div>
  )
}
