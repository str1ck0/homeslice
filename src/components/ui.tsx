import Link from 'next/link'
import { formatCents } from '@/core/money'

/** Initials avatar. Used everywhere a person appears. */
export function Avatar({
  name,
  url,
  size = 40,
}: {
  name: string
  url?: string | null
  size?: number
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <div
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full bg-accent/15 font-semibold text-accent"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials || '?'}
    </div>
  )
}

/**
 * A signed amount, coloured by direction.
 * Positive means the person is owed; negative means they owe.
 */
export function Amount({
  cents,
  currency,
  className = '',
}: {
  cents: number
  currency: string
  className?: string
}) {
  const tone = cents === 0 ? 'text-muted' : cents > 0 ? 'text-positive' : 'text-negative'
  return (
    <span className={`amount ${tone} ${className}`}>
      {formatCents(Math.abs(cents), currency)}
    </span>
  )
}

export function Card({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-2xl border border-edge bg-raised ${className}`}>{children}</div>
  )
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <h2 className="text-lg font-semibold text-balance">{title}</h2>
      <p className="max-w-sm text-sm text-muted text-balance">{body}</p>
      {action}
    </div>
  )
}

/** Bottom navigation. Thumb-reachable, and the shape a native shell expects. */
export function BottomNav({ active }: { active: 'home' | 'groups' | 'account' }) {
  const items = [
    { key: 'home', href: '/dashboard', label: 'Home' },
    { key: 'groups', href: '/groups', label: 'Groups' },
    { key: 'account', href: '/account', label: 'Account' },
  ] as const

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-edge bg-raised/95 backdrop-blur">
      <ul className="mx-auto flex max-w-lg">
        {items.map((item) => (
          <li key={item.key} className="flex-1">
            <Link
              href={item.href}
              aria-current={active === item.key ? 'page' : undefined}
              className={`flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors ${
                active === item.key ? 'text-accent' : 'text-muted hover:text-ink'
              }`}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
      <div style={{ height: 'env(safe-area-inset-bottom)' }} />
    </nav>
  )
}

export function PageShell({
  title,
  subtitle,
  action,
  children,
  nav,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
  children: React.ReactNode
  nav?: 'home' | 'groups' | 'account'
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col pb-24">
      <header className="flex items-start justify-between gap-4 px-5 pb-4 pt-8">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-balance">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
        {action}
      </header>
      <main className="flex-1 px-5">{children}</main>
      {nav && <BottomNav active={nav} />}
    </div>
  )
}
