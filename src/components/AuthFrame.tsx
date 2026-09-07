import type { ReactNode } from 'react'
import { APP_NAME, APP_SUBTITLE, SEED_HOTELS } from '../lib/domain'

/**
 * Split composition used by the three public pages (login, setup, invitation):
 * an editorial left panel with the house list, the form on the right.
 */
export function AuthFrame({
  eyebrow,
  title,
  intro,
  children,
  footer,
}: {
  eyebrow: string
  title: string
  intro?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="relative z-10 min-h-dvh lg:grid lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-ink-800 bg-ink-900/40 px-12 py-14 lg:flex">
        <div className="flex items-center gap-3">
          <span
            className="grid size-10 place-items-center rounded-[11px] border border-brass-700 bg-gradient-to-br from-brass-400 to-brass-500 font-display text-[14px] font-extrabold text-ink-950"
            aria-hidden
          >
            HD
          </span>
          <span className="leading-none">
            <span className="block font-display text-[16px] font-extrabold tracking-tight text-fog-50">{APP_NAME}</span>
            <span className="mt-1 block font-mono text-[10px] tracking-[0.26em] text-brass-400">{APP_SUBTITLE}</span>
          </span>
        </div>

        <div className="max-w-md">
          <h2 className="font-display text-[42px] leading-[1.04] tracking-[-0.03em] text-fog-50">
            Technische Meldungen,
            <span className="block text-brass-300">nicht im Gruppenchat.</span>
          </h2>
          <p className="mt-5 text-[14.5px] leading-relaxed text-fog-400">
            Jede Meldung ein Ticket: Zimmer, Foto, Priorität, Bearbeiter und Verlauf — nachvollziehbar für alle vier
            Häuser.
          </p>

          <ul className="mt-10 flex flex-col gap-3 border-t border-ink-800 pt-8">
            {SEED_HOTELS.map((h, i) => (
              <li key={h.slug} className="flex items-baseline gap-4">
                <span className="font-mono text-[10.5px] text-brass-700">{String(i + 1).padStart(2, '0')}</span>
                <span className="text-[13.5px] text-fog-300">{h.name}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-fog-500">
          Interner Zugang · nur für Mitarbeiter
        </p>
      </section>

      <section className="flex min-h-dvh flex-col justify-center px-5 py-12 sm:px-10 lg:px-14">
        <div className="mx-auto w-full max-w-[400px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span
              className="grid size-10 place-items-center rounded-[11px] border border-brass-700 bg-gradient-to-br from-brass-400 to-brass-500 font-display text-[14px] font-extrabold text-ink-950"
              aria-hidden
            >
              HD
            </span>
            <span className="leading-none">
              <span className="block font-display text-[15px] font-extrabold tracking-tight text-fog-50">
                {APP_NAME}
              </span>
              <span className="mt-1 block font-mono text-[9.5px] tracking-[0.24em] text-brass-400">{APP_SUBTITLE}</span>
            </span>
          </div>

          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-2 font-display text-[27px] leading-tight text-fog-50">{title}</h1>
          {intro && <p className="mt-2.5 text-[14px] leading-relaxed text-fog-400">{intro}</p>}

          <div className="mt-7">{children}</div>

          {footer && <div className="mt-7 border-t border-ink-800 pt-5 text-[13px] text-fog-500">{footer}</div>}
        </div>
      </section>
    </div>
  )
}
