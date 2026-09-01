import type { Config } from 'tailwindcss'

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: 'rgb(var(--surface) / <alpha-value>)',
        raised: 'rgb(var(--surface-raised) / <alpha-value>)',
        edge: 'rgb(var(--border) / <alpha-value>)',
        ink: 'rgb(var(--text) / <alpha-value>)',
        muted: 'rgb(var(--text-muted) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        positive: 'rgb(var(--positive) / <alpha-value>)',
        negative: 'rgb(var(--negative) / <alpha-value>)',
        // What text on a solid accent/negative fill has to be. White only
        // holds in the light theme; the dark theme's accent is bright enough
        // that its label has to go dark instead.
        'on-accent': 'rgb(var(--on-accent) / <alpha-value>)',
        'on-negative': 'rgb(var(--on-negative) / <alpha-value>)',
      },
    },
  },
  plugins: [],
} satisfies Config
