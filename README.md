# HD HOTELS – TECHNIK

Interne Technik-Plattform der HD Hotels. Rezeption und Haustechnik melden, bearbeiten und
dokumentieren technische Probleme in allen Häusern — als Ersatz für WhatsApp-Gruppen.

Die App ist mobile-first, installierbar (PWA) und läuft vollständig auf Netlify: Auth,
Datenbank, Datei-Speicher und Server-Funktionen inklusive. Alle Meldungen und Fotos sind
ausschließlich für angemeldete, berechtigte Mitarbeiter sichtbar.

## Funktionsumfang

- **Login & Rollen** — Admin (alles), Technik (bearbeiten), Rezeption (melden). Eigene Konten
  pro Mitarbeiter, gesperrte Konten verlieren ihre Sitzungen sofort.
- **Einladung per QR-Code** — Admins erzeugen einen QR-Code mit Rolle, Haus, Gültigkeitsdauer
  und Anzahl der Nutzungen. Ohne gültige Einladung ist keine Registrierung möglich.
- **Neue Meldung** — Hotel, Bereich, Zimmernummer, Beschreibung, Priorität und Fotos direkt
  aus der Kamera; Zeitpunkt und Ersteller werden automatisch gespeichert.
- **Ticketsystem** — Offen / In Bearbeitung / Erledigt, „Übernehmen“ mit Bearbeiter-Name,
  Kommentare, Fotos vor und nach der Reparatur (Nachweisfoto optional erzwingbar).
- **Suche, Filter & Raumhistorie** — Volltextsuche über Zimmer, Problem, Haus und Mitarbeiter;
  Filter nach Haus, Status, Priorität und Bereich; pro Raum die vollständige Historie, um
  wiederkehrende Probleme zu erkennen.
- **Dashboard** — offene, laufende, heute erledigte und sehr dringende Tickets, dazu Zahlen
  pro Haus, pro Bereich und die häufigsten Problemstellen.
- **WhatsApp-Import** — Chat-Export (ZIP mit Medien oder `_chat.txt`) hochladen; die App
  erkennt Datum, Uhrzeit, Absender, Hotel, Zimmernummer und Problem, ordnet die Bilder zu und
  zeigt eine editierbare Vorschau. Unklare Einträge werden als „Zuordnung prüfen“ markiert.
  Im WhatsApp-Export selbst wird nichts verändert oder gelöscht.
- **Aktivitätsprotokoll** — pro Ticket wer erstellt, übernommen, kommentiert, Fotos ergänzt
  oder den Status geändert hat.

## Technik

| Bereich | Umsetzung |
| --- | --- |
| Framework | TanStack Start (React 19) mit SSR und dateibasiertem Routing |
| Server-Logik | TanStack Server Functions (`POST`), Zod-validiert |
| Datenbank | Netlify Database (Postgres) mit Drizzle ORM |
| Datei-Speicher | Netlify Blobs, ausgeliefert nur über `/api/media/*` hinter der Session-Prüfung |
| Auth | Eigene Session-Cookies (httpOnly), `scrypt`-Passwort-Hashes, Einladungs-Token gehasht |
| UI | Tailwind CSS 4, Lucide Icons, eigene Komponenten |
| PWA | Manifest, Service Worker (ohne Caching privater Daten), Offline-Hinweisseite |

## Lokal starten

```bash
pnpm install
netlify dev          # empfohlen: stellt Datenbank & Blobs bereit
```

`netlify dev` startet Vite auf Port 3000 und die Netlify-Umgebung auf
[http://localhost:8888](http://localhost:8888). Ohne Netlify-Kontext fehlen Datenbank und
Blob-Speicher, weshalb `pnpm dev` nur für reine UI-Arbeit sinnvoll ist.

Beim ersten Aufruf leitet die App auf `/setup` und legt das erste Admin-Konto an; die vier
Häuser (Unique Dortmund, Majestic, Imperial, Pearl) werden dabei automatisch angelegt.

Weitere Skripte:

```bash
pnpm db:generate     # Migration aus db/schema.ts erzeugen (netlify/database/migrations)
pnpm icons           # PWA-Icons neu rendern (scripts/generate-icons.mjs)
pnpm build           # Produktions-Build
```

Details zur Architektur und zu den Konventionen stehen in [AGENTS.md](./AGENTS.md).
