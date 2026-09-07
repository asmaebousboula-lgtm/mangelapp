import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { ToastHost } from '../components/ui'
import { getSession } from '../server/auth.functions'
import { APP_NAME, APP_SUBTITLE } from '../lib/domain'
import '../styles.css'

export const Route = createRootRoute({
  beforeLoad: async () => ({ session: await getSession({ data: undefined }) }),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { title: `${APP_NAME} – ${APP_SUBTITLE}` },
      {
        name: 'description',
        content:
          'Interne Technik-Plattform der HD Hotels: technische Meldungen, Fotos, Räume und Bearbeitungsstände für alle Häuser.',
      },
      { name: 'theme-color', content: '#0d0f12' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
      { name: 'apple-mobile-web-app-title', content: 'HD Technik' },
      { name: 'mobile-web-app-capable', content: 'yes' },
      { name: 'robots', content: 'noindex, nofollow' },
      { name: 'format-detection', content: 'telephone=no' },
    ],
    links: [
      { rel: 'manifest', href: '/manifest.webmanifest' },
      { rel: 'icon', href: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { rel: 'icon', href: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=IBM+Plex+Mono:wght@400;500;600&family=Instrument+Sans:wght@400;500;600&display=swap',
      },
    ],
  }),
  shellComponent: RootDocument,
})

const SW_REGISTER = `
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  });
}
`

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <ToastHost />
        <Scripts />
        <script dangerouslySetInnerHTML={{ __html: SW_REGISTER }} />
      </body>
    </html>
  )
}
