import type { CapacitorConfig } from '@capacitor/cli'

// The app is TanStack Start with SSR and Netlify server functions, so there is no static
// bundle a webview could host on its own. Both native shells therefore load the deployed
// production site; `webDir` only satisfies the Capacitor CLI (see capacitor/www/index.html).
const config: CapacitorConfig = {
  appId: 'de.hdhotels.technik',
  appName: 'HD Technik',
  webDir: 'capacitor/www',
  // The UI is dark-only; without this the webview flashes white before the remote page paints.
  // Same value as `background_color`/`theme_color` in public/manifest.webmanifest.
  backgroundColor: '#0d0f12',
  server: {
    url: 'https://mangelapp.netlify.app',
    // Everything is served over TLS; plain HTTP must stay impossible in the webview
    // because sessions and ticket media travel over this connection.
    cleartext: false,
    // Keep the session inside the app for our own host only. Anything else (a mailto:,
    // an external link) is handed to the system browser instead of the webview.
    allowNavigation: ['mangelapp.netlify.app'],
  },
  ios: {
    // The web app already draws edge-to-edge via `viewport-fit=cover` and
    // `env(safe-area-inset-*)`, so the webview must not add its own inset on top.
    contentInset: 'never',
  },
  android: {
    allowMixedContent: false,
  },
}

export default config
