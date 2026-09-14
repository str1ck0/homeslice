'use client'

import { usePathname } from 'next/navigation'
import { BottomNav, type NavKey } from '@/components/ui'

const TABS: Record<string, NavKey> = {
  '/dashboard': 'home',
  '/friends': 'friends',
  '/groups': 'groups',
  '/account': 'account',
}

/**
 * The tab bar, for the loading placeholder only.
 *
 * Without it, switching tabs would blank the bar for as long as the next page
 * takes, which reads as the app falling over. The placeholder is shared by
 * every route, so it works out the tab from the address it is loading; pages
 * that have no tab bar get none here either.
 */
export default function LoadingNav() {
  const active = TABS[usePathname()]
  return active ? <BottomNav active={active} /> : null
}
