'use client'

import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'homeslice-theme'

const OPTIONS: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

/**
 * Starts at `null` — the same thing the server rendered — and only picks up
 * the stored choice after mount, so this never disagrees with the
 * layout's pre-hydration script about what's on screen.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    setTheme(stored === 'light' || stored === 'dark' ? stored : 'system')
  }, [])

  function choose(next: Theme) {
    setTheme(next)
    if (next === 'system') {
      localStorage.removeItem(STORAGE_KEY)
      delete document.documentElement.dataset.theme
    } else {
      localStorage.setItem(STORAGE_KEY, next)
      document.documentElement.dataset.theme = next
    }
  }

  return (
    <div className="flex items-center justify-between p-4">
      <span className="text-sm text-muted">Appearance</span>
      <div className="flex gap-1 rounded-xl border border-edge p-1">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => choose(option.value)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              theme === option.value ? 'bg-accent text-on-accent' : 'text-muted'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
