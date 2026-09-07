import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Homeslice',
  description: 'Split costs and settle up, without the arithmetic.',
  manifest: '/manifest.webmanifest',
  // iOS ignores the manifest's icons and looks for apple-touch-icon.
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/icon-192.png',
  },
  appleWebApp: { capable: true, title: 'Homeslice', statusBarStyle: 'default' },
  // Safari turns anything email- or number-shaped into a blue tappable link,
  // which is noise on a screen full of amounts and addresses.
  formatDetection: { email: false, telephone: false, address: false },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf9f7' },
    { media: '(prefers-color-scheme: dark)', color: '#0f0e0d' },
  ],
  width: 'device-width',
  initialScale: 1,
  // Stops iOS zooming the page when a form field is focused.
  maximumScale: 1,
  // Without this the safe-area insets all read 0, and installed on a phone the
  // tab bar ends up underneath the home indicator.
  viewportFit: 'cover',
}

// Read before paint, not in a client component: a useEffect would flash the
// system theme first and repaint after hydration.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('homeslice-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}})()`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-app antialiased">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {children}
      </body>
    </html>
  )
}
