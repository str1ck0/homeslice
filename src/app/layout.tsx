import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Homeslice',
  description: 'Split costs and run your house, without the paywall.',
  manifest: '/manifest.webmanifest',
  // iOS ignores the manifest's icons and looks for apple-touch-icon.
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/icon-192.png',
  },
  appleWebApp: { capable: true, title: 'Homeslice', statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafaf9' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0e0d' },
  ],
  width: 'device-width',
  initialScale: 1,
  // Stops iOS zooming the page when a form field is focused.
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  )
}
