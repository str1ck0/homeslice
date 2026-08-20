import Link from 'next/link'
import { formatCents } from '@/core/money'
import { MONTH_ABBR, formatRelativeTime } from '@/core/time'

export type NavKey = 'home' | 'friends' | 'groups' | 'account'

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
export function BottomNav({ active }: { active: NavKey }) {
  const items = [
    { key: 'home', href: '/dashboard', label: 'Home' },
    { key: 'friends', href: '/friends', label: 'Friends' },
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
  nav?: NavKey
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

/** Split a signed per-currency map into what you are owed and what you owe. */
export function splitByDirection(totals: Map<string, number>) {
  const owed = new Map<string, number>()
  const owing = new Map<string, number>()

  for (const [currency, cents] of totals) {
    if (cents > 0) owed.set(currency, cents)
    else if (cents < 0) owing.set(currency, -cents)
  }

  return { owed, owing }
}

/**
 * A balance, said in whichever direction each currency actually runs.
 *
 * "Overall, you're owed €59.79 + R500.00" was a lie whenever the two pointed
 * opposite ways: the euros were owed *by* you, coloured red under a heading
 * that said the reverse, and the plus sign invited adding numbers that must
 * never be added. Money in different currencies has no sum, and money in
 * different directions has no single sentence — so each direction gets a line.
 */
export function BalanceSummary({
  totals,
  size = 'md',
  className = '',
}: {
  totals: Map<string, number>
  size?: 'md' | 'lg'
  className?: string
}) {
  const { owed, owing } = splitByDirection(totals)

  if (owed.size === 0 && owing.size === 0) {
    return <p className={`text-sm text-muted ${className}`}>You&rsquo;re all square.</p>
  }

  // Two long amounts in one direction outgrew text-3xl on a phone and ran off
  // the edge; this leaves room for a second currency without shrinking the
  // single-currency case into insignificance.
  const amountClass = size === 'lg' ? 'text-2xl font-bold' : 'text-base font-semibold'

  return (
    <div className={`flex flex-col ${size === 'lg' ? 'gap-3' : 'gap-1'} ${className}`}>
      {owing.size > 0 && (
        <p>
          <span className="block text-sm text-muted">You owe</span>
          <CurrencyTotals
            totals={owing}
            forceDirection="owing"
            className={amountClass}
          />
        </p>
      )}
      {owed.size > 0 && (
        <p>
          <span className="block text-sm text-muted">You are owed</span>
          <CurrencyTotals
            totals={owed}
            forceDirection="owed"
            className={amountClass}
          />
        </p>
      )}
    </div>
  )
}

/**
 * The compact version, for a list row. Same rule as BalanceSummary: a row can
 * hold both directions at once — someone can owe you rand while you owe them
 * euros — so it never claims a single one.
 */
export function PersonBalance({
  totals,
  owesYouLabel = 'owes you',
}: {
  totals: Map<string, number>
  owesYouLabel?: string
}) {
  const { owed, owing } = splitByDirection(totals)

  return (
    <div className="flex flex-col gap-0.5">
      {owed.size > 0 && (
        <div>
          <p className="text-xs text-muted">{owesYouLabel}</p>
          <CurrencyTotals totals={owed} forceDirection="owed" className="font-semibold" />
        </div>
      )}
      {owing.size > 0 && (
        <div>
          <p className="text-xs text-muted">you owe</p>
          <CurrencyTotals totals={owing} forceDirection="owing" className="font-semibold" />
        </div>
      )}
    </div>
  )
}

/**
 * Several currencies running the same way, joined with "+".
 *
 * Currencies are never converted, so more than one can be outstanding at once.
 * The "+" is safe here and only here: everything in this list points the same
 * direction, because the callers split by direction first. Each figure carries
 * `amount` so it never breaks mid-number, while the list itself is free to wrap
 * — two long amounts used to run straight off a phone screen.
 */
export function CurrencyTotals({
  totals,
  className = '',
  forceDirection,
}: {
  totals: Map<string, number>
  className?: string
  /**
   * Colour every entry the same way regardless of sign. Used by
   * BalanceSummary, which has already sorted them into a direction and passes
   * positive numbers for both.
   */
  forceDirection?: 'owed' | 'owing'
}) {
  const entries = [...totals.entries()]
  if (entries.length === 0) return null

  return (
    <span className={className}>
      {entries.map(([currency, cents], index) => (
        <span key={currency}>
          {index > 0 && <span className="text-muted"> + </span>}
          <span
            className={
              'amount ' +
              ((forceDirection ?? (cents > 0 ? 'owed' : 'owing')) === 'owed'
                ? 'text-positive'
                : 'text-negative')
            }
          >
            {formatCents(Math.abs(cents), currency)}
          </span>
        </span>
      ))}
    </span>
  )
}

/**
 * "You owe Sam R878.91 in Cape Town" — one line per group and currency.
 *
 * The breakdown matters because the total alone hides where a debt came from,
 * and people reason about "the house" separately from "last night's dinner".
 */
export function DebtBreakdown({
  lines,
  className = '',
}: {
  lines: {
    groupName: string | null
    currency: string
    amountCents: number
    otherName: string
  }[]
  className?: string
}) {
  if (lines.length === 0) return null

  return (
    <ul className={`flex flex-col gap-1 border-l border-edge pl-3 ${className}`}>
      {lines.map((line, index) => {
        const youOwe = line.amountCents < 0
        return (
          <li key={index} className="text-sm text-muted">
            {youOwe ? 'You owe' : `${line.otherName} owes you`}{' '}
            {youOwe && <span>{line.otherName} </span>}
            <span className={`amount font-medium ${youOwe ? 'text-negative' : 'text-positive'}`}>
              {formatCents(Math.abs(line.amountCents), line.currency)}
            </span>{' '}
            {line.groupName ? `in ${line.groupName}` : 'in non-group expenses'}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * The chrome every ledger row shares: the date block on the left, a title and
 * sublines in the middle, your position on the right.
 *
 * Split out so an expense and a payment cannot drift apart visually, and so a
 * deleted entry can be the same shape without being a link — there is no page
 * for an expense that is gone, and a card that 404s is worse than one that
 * does not move. A deleted row keeps its amount, struck through: what it once
 * moved is the reason the balance changed back.
 */
function LedgerRow({
  href,
  date,
  title,
  subline,
  activity,
  rightLabel,
  right,
  muted = false,
}: {
  href: string | null
  date: Date
  title: React.ReactNode
  subline: React.ReactNode
  activity?: React.ReactNode
  rightLabel: string
  right: React.ReactNode
  muted?: boolean
}) {
  const body = (
    <>
      <div className="w-10 shrink-0 text-center">
        <p className="text-xs uppercase text-muted">{MONTH_ABBR[date.getMonth()]}</p>
        <p className="text-lg font-semibold leading-tight">{date.getDate()}</p>
      </div>

      <div className="min-w-0 flex-1">
        <p className={`truncate font-semibold ${muted ? 'line-through' : ''}`}>{title}</p>
        <p className="truncate text-sm text-muted">{subline}</p>
        {activity && <p className="truncate text-xs text-muted">{activity}</p>}
      </div>

      <div className="shrink-0 text-right">
        <p className="text-xs text-muted">{rightLabel}</p>
        {/* Struck on the amount alone: text-decoration propagates to
            descendants and cannot be switched off further down, so striking
            the whole column would strike the label with it. */}
        <span className={muted ? 'line-through' : ''}>{right}</span>
      </div>
    </>
  )

  const shell =
    'flex items-center gap-3 rounded-2xl border border-edge bg-raised p-4 transition-colors'

  return href ? (
    <Link href={href} className={`${shell} hover:border-accent/50`}>
      {body}
    </Link>
  ) : (
    <div className={`${shell} opacity-60`}>{body}</div>
  )
}

export interface RowActivity {
  action: 'added' | 'updated' | 'deleted' | 'restored'
  /** Null when the entry predates the event record, and nobody can be named. */
  actorName: string | null
  actorIsYou: boolean
  at: string
}

const ACTIVITY_VERB: Record<RowActivity['action'], string> = {
  added: 'Added',
  updated: 'Edited',
  deleted: 'Deleted',
  restored: 'Restored',
}

/**
 * "Edited by lizzardwizzard · 2 hours ago" — why this row is where it is.
 *
 * Recent is sorted by when something was touched, not by the date on it, so a
 * backdated expense can sit at the top with an old date in its corner. Without
 * this line that looks like a sorting bug.
 */
function ActivityNote({ activity }: { activity: RowActivity }) {
  const who = activity.actorIsYou ? 'you' : activity.actorName
  const verb = ACTIVITY_VERB[activity.action]
  return (
    <>
      {who ? `${verb} by ${who}` : verb} &middot; {formatRelativeTime(activity.at)}
    </>
  )
}

/** " · Group · Euro 26", or nothing at all outside a group. */
function GroupNote({ groupName }: { groupName?: string | null }) {
  if (!groupName) return null
  return (
    <>
      {' '}
      &middot; <span title="Group expense">Group &middot; {groupName}</span>
    </>
  )
}

/**
 * One expense in a list, laid out the way Splitwise does it: the date on the
 * left, who paid underneath the description, and your position on the right.
 *
 * "you lent" / "you borrowed" reads better than a bare signed number — it says
 * what happened rather than making you infer it from a colour.
 *
 * `groupName` marks an expense that came from a group, for the lists that mix
 * the two. It rides on the existing subline rather than adding anything, so a
 * group expense and a one-off are the same card in the same shape — the group
 * page passes nothing, because there every row is in the same group.
 */
export function ExpenseRow({
  expense,
  groupName,
  activity,
  deleted = false,
}: {
  expense: {
    id: string
    description: string
    amountCents: number
    currency: string
    expenseDate: string
    paidByNames: string[]
    yourShareCents: number
    yourPaidCents: number
    imageCount: number
  }
  groupName?: string | null
  activity?: RowActivity
  deleted?: boolean
}) {
  const yourNet = expense.yourPaidCents - expense.yourShareCents
  const date = new Date(`${expense.expenseDate}T00:00:00`)

  return (
    <LedgerRow
      href={deleted ? null : `/expenses/${expense.id}`}
      date={date}
      muted={deleted}
      title={
        <>
          {expense.description}
          {expense.imageCount > 0 && (
            <span
              className="ml-1.5 text-muted"
              title={`${expense.imageCount} photo${expense.imageCount === 1 ? '' : 's'}`}
            >
              &#128247;
            </span>
          )}
        </>
      }
      subline={
        <>
          {expense.paidByNames.length > 0
            ? `${expense.paidByNames.join(' & ')} paid ${formatCents(expense.amountCents, expense.currency)}`
            : formatCents(expense.amountCents, expense.currency)}
          <GroupNote groupName={groupName} />
        </>
      }
      activity={activity && <ActivityNote activity={activity} />}
      rightLabel={
        deleted
          ? 'removed'
          : yourNet === 0
            ? 'not involved'
            : yourNet > 0
              ? 'you lent'
              : 'you borrowed'
      }
      right={
        yourNet !== 0 && (
          <Amount cents={yourNet} currency={expense.currency} className="font-semibold" />
        )
      }
    />
  )
}

/**
 * A recorded payment, sitting in the same list as the expenses it settles.
 *
 * Deliberately shaped like ExpenseRow and deliberately not identical to it: a
 * payment is not an expense, so it reads "You paid Sam" rather than a
 * description, and carries a marker so you can tell the two apart at a glance.
 * Both are entries in the same ledger, and both open to a page that says who
 * did what.
 */
export function SettlementRow({
  settlement,
  currentProfileId,
  groupName,
  activity,
  deleted = false,
}: {
  settlement: {
    id: string
    amountCents: number
    currency: string
    settledOn: string
    method: string | null
    fromProfileId: string
    fromName: string
    toProfileId: string
    toName: string
  }
  currentProfileId: string
  groupName?: string | null
  activity?: RowActivity
  deleted?: boolean
}) {
  const date = new Date(`${settlement.settledOn}T00:00:00`)
  const youPaid = settlement.fromProfileId === currentProfileId
  const youWerePaid = settlement.toProfileId === currentProfileId

  const headline = youPaid
    ? `You paid ${settlement.toName}`
    : youWerePaid
      ? `${settlement.fromName} paid you`
      : `${settlement.fromName} paid ${settlement.toName}`

  // Signed the way ExpenseRow signs yourNet: paying someone reduces what you
  // owe, so it counts in your favour; being paid counts against you.
  const yourNet = youPaid ? settlement.amountCents : youWerePaid ? -settlement.amountCents : 0

  return (
    <LedgerRow
      href={deleted ? null : `/settlements/${settlement.id}`}
      date={date}
      muted={deleted}
      title={
        <>
          <span className="mr-1.5 text-muted" title="Payment">
            &#8646;
          </span>
          {headline}
        </>
      }
      subline={
        <>
          Payment{settlement.method ? ` \u00b7 ${settlement.method}` : ''}
          <GroupNote groupName={groupName} />
        </>
      }
      activity={activity && <ActivityNote activity={activity} />}
      rightLabel={
        deleted
          ? 'removed'
          : yourNet === 0
            ? 'not involved'
            : yourNet > 0
              ? 'you paid'
              : 'you received'
      }
      right={
        <span className="amount font-semibold">
          {formatCents(settlement.amountCents, settlement.currency)}
        </span>
      }
    />
  )
}
