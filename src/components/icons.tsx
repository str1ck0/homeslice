/**
 * The tab bar's icons. Deliberately plain: one stroke weight, one 24px grid,
 * `currentColor` throughout, so a tab's colour is decided by the tab and not
 * by the drawing. Silhouettes are kept far apart — a house, one head, three
 * heads, a head in a ring — because at 24px on a phone that outline is all
 * anyone actually reads.
 */
export type IconProps = { className?: string }

function Svg({ className = 'h-6 w-6', children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  )
}

export function HomeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 10.6 12 3.75l8.5 6.85V19.5a1.25 1.25 0 0 1-1.25 1.25H4.75A1.25 1.25 0 0 1 3.5 19.5z" />
      <path d="M9.75 20.75v-6h4.5v6" />
    </Svg>
  )
}

export function FriendIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.75 20.25c0-3.6 3.25-6 7.25-6s7.25 2.4 7.25 6" />
    </Svg>
  )
}

export function GroupIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="9.25" cy="9" r="3.25" />
      <path d="M3 20.25c0-3.35 2.8-5.5 6.25-5.5s6.25 2.15 6.25 5.5" />
      <path d="M16.5 6.2a3.25 3.25 0 0 1 0 5.6" />
      <path d="M17.75 14.9c2.15.6 3.25 2.4 3.25 5.35" />
    </Svg>
  )
}

export function AccountIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.75" />
      <circle cx="12" cy="10" r="2.9" />
      <path d="M6.4 18.6c1.2-2.05 3.2-3.35 5.6-3.35s4.4 1.3 5.6 3.35" />
    </Svg>
  )
}
