# AGENTS.md

Overview of this codebase for developers and AI agents. It describes how the app is put
together, where things live, and which decisions are deliberate and should not be "cleaned up".

## Project overview

**HD HOTELS – TECHNIK** is the internal technical-maintenance app of a hotel group (four
houses). Reception staff report defects, the technical team claims and resolves them, admins
manage staff, hotels, settings and the WhatsApp chat import. Everything is in German; the UI
is mobile-first and installable as a PWA.

### Tech stack

| Layer | Technology |
| --- | --- |
| Framework | TanStack Start (SSR) |
| Frontend | React 19, TanStack Router v1 (flat file-based routes) |
| Build | Vite 7 |
| Styling | Tailwind CSS 4 (`@theme` tokens, no UI library) |
| Icons | lucide-react |
| Validation | Zod 4 |
| Database | Netlify Database (Postgres) + Drizzle ORM (`drizzle-orm/netlify-db`) |
| File storage | Netlify Blobs |
| Language | TypeScript 5.9 (strict) |
| Deployment | Netlify (`@netlify/vite-plugin-tanstack-start`) |
| Native apps | Capacitor 8 (iOS + Android shells around the deployed site) |

## Directory structure

```
├── android/                          # generated Capacitor Android project
│   └── capacitor-android/            # vendored @capacitor/android Gradle library
├── ios/                              # generated Capacitor Xcode project
├── capacitor/www/index.html          # webDir placeholder (see non-obvious decisions)
├── capacitor.config.ts               # appId, appName, server.url, native webview options
├── db
│   ├── schema.ts                     # Drizzle schema: hotels, rooms, users, sessions,
│   │                                 # invites, tickets, ticketPhotos, ticketComments,
│   │                                 # ticketEvents, notifications, importBatches,
│   │                                 # importEntries, appSettings
│   └── index.ts                      # db client (drizzle-orm/netlify-db)
├── netlify
│   └── database/migrations           # generated SQL — applied by the Netlify platform
├── public
│   ├── icons/                        # generated PWA icons (see scripts/generate-icons.mjs)
│   ├── manifest.webmanifest
│   ├── offline.html                  # self-contained offline notice
│   └── sw.js                         # service worker; never caches private data
├── scripts
│   └── generate-icons.mjs            # dependency-free PNG icon generator
├── src
│   ├── components
│   │   ├── ui.tsx                    # design system: Button, Card, Field, Input, Select,
│   │   │                             # Textarea, Sheet, Alert, Badge, Toggle, SegmentedControl,
│   │   │                             # EmptyState, SectionTitle, Stat, toast/ToastHost, cx
│   │   ├── AppShell.tsx              # header, bottom nav (mobile), sidebar (desktop)
│   │   ├── AuthFrame.tsx             # shared frame for login/setup/invite pages
│   │   ├── badges.tsx                # StatusBadge, PriorityBadge
│   │   ├── TicketCard.tsx            # list item + TicketCardSkeleton
│   │   ├── PhotoUploader.tsx         # camera-first picker; compresses and uploads immediately
│   │   ├── Lightbox.tsx              # full-screen photo viewer
│   │   └── NotificationBell.tsx      # urgent-ticket notice for technicians/admins
│   ├── lib
│   │   ├── domain.ts                 # roles, areas, priorities, statuses, labels, permissions
│   │   ├── format.ts                 # German date/time/size/relative-time formatting
│   │   ├── image.ts                  # canvas compression + upload helpers (browser)
│   │   └── whatsapp.ts               # pure chat parser + draft builder (shared)
│   ├── server
│   │   ├── db.server.ts              # db re-export + ensureSeeded()
│   │   ├── auth.server.ts            # scrypt hashing, sliding sessions, session revocation,
│   │   │                             # identifier lookup, invite tokens, requireUser/requireAdmin
│   │   ├── media.server.ts           # Netlify Blobs read/write, key generation
│   │   ├── settings.server.ts        # app config (requireAfterPhoto, notifyUrgent)
│   │   ├── tickets.server.ts         # ticket queries/mutations + event log
│   │   ├── auth.functions.ts         # login (e-mail/username), logout, session, setup,
│   │   │                             # QR activation / device / legacy signup, own password
│   │   ├── tickets.functions.ts      # dashboard, list, detail, create, status, photos, comments
│   │   ├── admin.functions.ts        # staff CRUD, password reset, device logout, per-account
│   │   │                             # QR codes, hotels, settings
│   │   └── import.functions.ts       # WhatsApp batches, entries, commit, discard
│   └── routes
│       ├── __root.tsx                # html shell, head tags, SW registration
│       ├── login.tsx / setup.tsx / einladung.$token.tsx   # public routes
│       ├── _app.tsx                  # pathless layout: auth gate + AppShell
│       ├── _app.index.tsx            # dashboard
│       ├── _app.tickets.index.tsx    # ticket list, search & filters
│       ├── _app.tickets.neu.tsx      # new report
│       ├── _app.tickets.$ticketId.tsx# detail: workflow, photos, comments, history
│       ├── _app.raeume.tsx           # rooms + room history
│       ├── _app.team.tsx             # staff accounts, per-account QR codes, deleted accounts
│       ├── _app.admin.whatsapp.index.tsx    # upload & parse a chat export
│       ├── _app.admin.whatsapp.$batchId.tsx # editable import preview
│       ├── _app.admin.einstellungen.tsx     # hotels + app settings
│       ├── api.upload.ts             # POST media (session-checked)
│       └── api.media.$.ts            # GET media (session-checked)
```

## Conventions

- **Server functions for everything.** All data access goes through
  `createServerFn({ method: 'POST' }).inputValidator(zodSchema).handler(...)`. Note the name:
  `.inputValidator()`, not `.validator()`.
- **Reads are POST too.** Even list/detail queries use `method: 'POST'` so that no private
  payload ever ends up in a GET-cacheable URL. Do not "optimise" these to GET.
- **Every handler authorises itself.** `requireUser()` / `requireAdmin()` at the top of the
  handler, and permission helpers from `src/lib/domain.ts` (`isAdmin`, `canWorkTickets`, `canCreateTickets`).
  Route-level `beforeLoad` guards are UX, not security — the server function is the boundary.
- **Route state lives in the URL.** Filters, search terms and pagination are Zod-validated
  `validateSearch` params, fed to the loader through `loaderDeps`. This keeps views shareable
  and SSR-correct; typing is debounced before it hits the URL.
- **Labels come from `src/lib/domain.ts`.** German strings for roles, areas, priorities and
  statuses are defined once; don't inline them in components.
- **Mutations are followed by `router.invalidate()`** so loaders refetch instead of the UI
  keeping local copies of server state.
- **Ticket changes write an event.** Anything that mutates a ticket appends to `ticketEvents`
  via `logEvent()` in `tickets.server.ts` — the activity log is a requirement, not a nicety.

## Non-obvious decisions

- **Accounts are admin-managed, never self-served.** There is no public sign-up route.
  `/setup` works exactly once (while no user exists) to create the first admin; every other
  account is created by an admin in „Mitarbeiter“. Each employee has one permanent account
  with a name, an e-mail address *and/or* a username (`findUserByIdentifier` accepts either,
  at least one must be set) and a scrypt-hashed password.
- **QR codes are onboarding, not login.** `invites.purpose` decides what a code does:
  `activation` (the employee sets their own password for an account the admin created),
  `device` (signs one extra device in, no password typing) or the legacy `signup`
  (self-registration behind a role-based code — kept so older codes stay redeemable).
  Activation/device codes are bound to `invites.userId`, single-use and short-lived; creating
  a new one of the same kind revokes the outstanding one. Tokens are stored hashed and the QR
  (SVG, rendered server-side by `qrcode`) carries a `/einladung/<token>` URL. Nobody ever
  needs a code for the daily sign-in — that is identifier + password.
- **Sessions are long-lived and slide.** `SESSION_DAYS = 180`, refreshed on use (at most one
  write per 12 h via `lastSeenAt`/`RENEW_AFTER_MS`), so a device stays signed in until the
  person logs out or an admin intervenes. That is what makes the cookie usable inside the
  Capacitor webviews, which have no "closed the browser" moment. `currentUser()` re-checks
  `status` on every request, so deactivating or deleting an account cuts access off at the
  next request even on a device holding a valid cookie.
- **Deleting an employee never destroys attribution.** `deleteStaff` removes the row only when
  the person has no tickets, photos, comments, events or imports behind them. Otherwise it
  archives: `status = 'deleted'`, e-mail and username released to NULL, password hash scrubbed
  to an unusable value, sessions and pending codes revoked — the name stays so the history
  keeps reading correctly. Statuses are `active | inactive | deleted`; legacy `'blocked'` rows
  were migrated and `normalizeStatus()` still maps anything unknown to `inactive`.
- **`mustChangePassword` is a gate, not a hint.** An admin-issued password sets the flag and
  `AppShell` renders `PasswordGate` instead of the app until it is replaced (`changeOwnPassword`
  clears the flag and calls `revokeOtherSessions`). Activating via QR sets the person's own
  password, so the flag is already clear there.
- **Media is never public.** Uploads go to Netlify Blobs and are only served through
  `/api/media/*`, which checks the session on every request. `/api/*` is additionally
  `private, no-store` in `netlify.toml`, and the service worker skips `/api/` and
  `_serverFn` traffic entirely, so nothing private is ever written to a cache.
- **WhatsApp exports are unpacked in the browser.** `fflate.unzipSync` extracts the archive
  client-side, `src/lib/whatsapp.ts` parses it, and only a small JSON draft is posted to
  `createImportBatch`. Attachments are compressed and uploaded one file at a time. This is
  deliberate: a whole export would exceed the serverless function payload limit.
- **Imports are never destructive.** A batch stays a `draft` until an admin presses
  „Import starten“; entries can be edited or deselected, ambiguous ones are flagged
  „Zuordnung prüfen“ (the reason is recomputed server-side after each edit). Nothing in the
  WhatsApp export is altered or removed, and discarding a batch only drops the draft.
- **Migrations are generated, never run locally.** `pnpm db:generate` writes SQL into
  `netlify/database/migrations`; the Netlify platform applies it on deploy. There is no
  `db:migrate` script — don't add one that runs against production.
- **Hotels are data, not constants.** `SEED_HOTELS` (in `src/lib/domain.ts`) only seeds the four initial houses via
  `ensureSeeded()`; admins add more in Einstellungen. Code must resolve hotels from the
  database (slug → id) rather than hard-coding them.
- **Charts are plain CSS.** Dashboard statistics use shared-scale bars instead of a charting
  library, which keeps the client bundle small; no chart dependency is installed.
- **The native apps are thin shells, not a second build.** Because the app is SSR with
  Netlify server functions, there is no static bundle a webview could host. `capacitor.config.ts`
  therefore sets `server.url` to `https://mangelapp.netlify.app`, so iOS and Android load the
  deployed site and every existing route, session cookie and server function keeps working
  unchanged. `webDir` points at `capacitor/www`, a committed placeholder page the CLI requires
  for `cap copy`; it is not the app. There is no separate mobile build step — `pnpm cap:sync`
  only refreshes native config, and shipping a web change to Netlify ships it to both apps.
  `allowNavigation` is limited to our own host so external links leave the webview.
- **The iOS shell's generated resources are committed on purpose.** `App.xcodeproj` lists
  `capacitor.config.json`, `config.xml` and `public/` in its Resources build phase, so Xcode
  fails the build when they are absent. Capacitor's default `ios/.gitignore` excludes exactly
  those three because `cap sync` regenerates them — which meant the project only built after a
  Node install plus `npx cap sync ios`. They are therefore tracked, and the matching ignore
  rules removed, so `ios/App/App.xcodeproj` opens and builds straight from a fresh clone; the
  one remaining dependency, `capacitor-swift-pm`, is a remote SPM package pinned to an exact
  version in `CapApp-SPM/Package.swift` that Xcode resolves by itself. They are still generated
  artefacts and not hand-edited: after changing `capacitor.config.ts` or `capacitor/www/`, run
  `pnpm cap:sync` and commit the regenerated files.
- **The Android shell is a self-contained Gradle project.** For the same reason as iOS, and in
  the same way: `android/` must open in Android Studio straight from a fresh clone, with JVM 21
  and no Node. Capacitor's default `android/.gitignore` excludes
  `capacitor-cordova-android-plugins/`, `app/src/main/assets/public/`,
  `app/src/main/assets/capacitor.config.json`, `app/src/main/assets/capacitor.plugins.json` and
  `app/src/main/res/xml/config.xml`, all of which `settings.gradle`, `app/build.gradle` and
  `app/capacitor.build.gradle` reference — Gradle sync fails on the missing
  `cordova.variables.gradle` before it gets anywhere. Those are therefore tracked and the ignore
  rules removed. The other half of the problem is `capacitor.settings.gradle`, which `cap sync`
  regenerates pointing `:capacitor-android` into `node_modules`: `android/capacitor-android/` is
  a vendored copy of the Gradle library project from the `@capacitor/android` package, and
  `settings.gradle` uses the generated file when an install is present and falls back to the
  vendored copy when it is not. So `cap sync` stays the source of truth and a clone with no
  toolchain still configures. Refresh the copy after bumping `@capacitor/android` — see
  `android/capacitor-android/README.md`. Adding a Capacitor *plugin* adds another `node_modules`
  Gradle project that the fallback does not cover; vendor it the same way.
- **iOS needs the camera usage descriptions.** `PhotoUploader` uses
  `<input type="file" capture="environment">`, which WKWebView answers with the system camera.
  `NSCameraUsageDescription` and `NSPhotoLibraryUsageDescription` in `ios/App/App/Info.plist`
  are load-bearing — iOS terminates the app on the first tap without them. Android deliberately
  does *not* declare `android.permission.CAMERA`: Capacitor's `BridgeWebChromeClient` treats an
  undeclared permission as "capture supported" and launches the capture intent directly, so
  declaring it would only add a runtime prompt.
- **Service workers may not register inside the iOS webview.** WKWebView only allows them for
  app-bound domains, which would restrict the Capacitor bridge. Registration in `__root.tsx`
  already fails silently, and the PWA is unaffected in browsers, so this is accepted rather
  than worked around.
- **Icons are generated without dependencies.** `scripts/generate-icons.mjs` rasterises the
  monogram and writes PNGs with a hand-rolled encoder (zlib + CRC32). Run `pnpm icons` after
  changing the mark.
