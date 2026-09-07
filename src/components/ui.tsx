import { forwardRef, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Loader2, X } from 'lucide-react'

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

/* ------------------------------------------------------------------ button */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet'
  size?: 'sm' | 'md' | 'lg'
  busy?: boolean
  icon?: ReactNode
  block?: boolean
}

const BUTTON_VARIANTS: Record<string, string> = {
  primary:
    'bg-brass-400 text-ink-950 border border-brass-300 hover:bg-brass-300 font-semibold shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_8px_24px_-12px_rgba(184,150,79,0.7)]',
  secondary: 'bg-ink-800 text-fog-100 border border-ink-700 hover:bg-ink-700 hover:border-ink-600',
  ghost: 'bg-transparent text-fog-300 border border-transparent hover:bg-ink-850 hover:text-fog-100',
  quiet: 'bg-ink-900/70 text-fog-300 border border-ink-700/70 hover:text-fog-100 hover:border-ink-600',
  danger: 'bg-ember-deep/25 text-ember border border-ember-deep/60 hover:bg-ember-deep/40 font-medium',
}

const BUTTON_SIZES: Record<string, string> = {
  sm: 'h-9 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-11 px-4 text-[14px] gap-2 rounded-[11px]',
  lg: 'h-14 px-5 text-[15px] gap-2.5 rounded-xl',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', busy, icon, block, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || busy}
      className={cx(
        'tap inline-flex items-center justify-center whitespace-nowrap disabled:opacity-50 disabled:pointer-events-none select-none',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  )
})

/* ------------------------------------------------------------------- badge */

export function Badge({
  children,
  tone = 'neutral',
  className,
  dot,
}: {
  children: ReactNode
  tone?: 'neutral' | 'amber' | 'steel' | 'moss' | 'ember' | 'brass'
  className?: string
  dot?: boolean
}) {
  const tones: Record<string, string> = {
    neutral: 'bg-ink-800 text-fog-300 border-ink-700',
    amber: 'bg-amber-signal/12 text-amber-signal border-amber-signal/35',
    steel: 'bg-steel-signal/12 text-steel-signal border-steel-signal/35',
    moss: 'bg-moss/12 text-moss border-moss/35',
    ember: 'bg-ember/14 text-ember border-ember/40',
    brass: 'bg-brass-500/14 text-brass-300 border-brass-500/40',
  }
  const dots: Record<string, string> = {
    neutral: 'bg-fog-400',
    amber: 'bg-amber-signal',
    steel: 'bg-steel-signal',
    moss: 'bg-moss',
    ember: 'bg-ember',
    brass: 'bg-brass-400',
  }
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-[3px] font-mono text-[10px] font-medium uppercase tracking-[0.1em]',
        tones[tone],
        className,
      )}
    >
      {dot && <span className={cx('size-1.5 rounded-full', dots[tone])} />}
      {children}
    </span>
  )
}

/* ------------------------------------------------------------------ fields */

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  className,
}: {
  label?: string
  hint?: string
  error?: string | null
  children: ReactNode
  htmlFor?: string
  className?: string
}) {
  return (
    <div className={cx('min-w-0', className)}>
      {label && (
        <label className="label" htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1.5 text-[12.5px] text-ember">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[12.5px] text-fog-500">{hint}</p>
      ) : null}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cx('field', className)} {...rest} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cx('field resize-y min-h-24', className)} {...rest} />
  },
)

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cx('field appearance-none pr-9 cursor-pointer', className)}
        {...rest}
      >
        {children}
      </select>
      <svg
        viewBox="0 0 12 8"
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 size-3 -translate-y-1/2 text-fog-400"
      >
        <path d="M1 1.5 6 6.5 11 1.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </div>
  )
})

/** Horizontally scrollable segmented control — works well with a thumb. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: Array<{ value: T; label: string; count?: number }>
  value: T
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div
      className={cx(
        'flex gap-1 overflow-x-auto rounded-xl border border-ink-700 bg-ink-900/80 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            'tap shrink-0 rounded-lg px-3 py-2 text-[13px] font-medium',
            value === o.value ? 'bg-ink-700 text-fog-50 shadow-sm' : 'text-fog-400 hover:text-fog-100',
          )}
        >
          {o.label}
          {typeof o.count === 'number' && (
            <span className={cx('ml-1.5 font-mono text-[11px]', value === o.value ? 'text-brass-300' : 'text-fog-500')}>
              {o.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
}) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-[14px] font-medium text-fog-100">
          {label}
        </label>
        {hint && <p className="mt-0.5 text-[12.5px] text-fog-500">{hint}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          'tap relative h-7 w-12 shrink-0 rounded-full border transition-colors',
          checked ? 'border-brass-500 bg-brass-500/70' : 'border-ink-600 bg-ink-800',
        )}
      >
        <span
          className={cx(
            'absolute top-[3px] size-5 rounded-full bg-fog-50 transition-transform',
            checked ? 'translate-x-[22px]' : 'translate-x-[3px]',
          )}
        />
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ layout */

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('surface', className)} {...rest}>
      {children}
    </div>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="font-display text-[17px] text-fog-50">{children}</h2>
      {action}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode
  title: string
  body?: string
  action?: ReactNode
}) {
  return (
    <div className="surface flex flex-col items-center px-6 py-14 text-center">
      {icon && (
        <div className="mb-4 grid size-14 place-items-center rounded-2xl border border-ink-700 bg-ink-850 text-brass-400">
          {icon}
        </div>
      )}
      <h3 className="font-display text-[16px] text-fog-100">{title}</h3>
      {body && <p className="mt-1.5 max-w-sm text-[13.5px] text-fog-400">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton rounded-lg', className)} />
}

export function Alert({ tone = 'error', children }: { tone?: 'error' | 'info' | 'success'; children: ReactNode }) {
  const tones = {
    error: 'border-ember/45 bg-ember/10 text-ember',
    info: 'border-steel-signal/40 bg-steel-signal/10 text-steel-signal',
    success: 'border-moss/40 bg-moss/10 text-moss',
  }
  return (
    <div className={cx('rounded-xl border px-3.5 py-3 text-[13.5px] leading-snug', tones[tone])} role="status">
      {children}
    </div>
  )
}

/* ------------------------------------------------------- modal / bottom sheet */

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ref.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="animate-fade absolute inset-0 bg-ink-950/80 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          'animate-sheet surface-raised relative flex max-h-[92vh] w-full flex-col rounded-b-none sm:rounded-b-[14px]',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-ink-700 px-5 py-4">
          <h3 className="font-display text-[16px] text-fog-50">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="tap grid size-8 place-items-center rounded-lg text-fog-400 hover:bg-ink-800 hover:text-fog-100"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-ink-700 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ toasts */

type Toast = { id: number; message: string; tone: 'success' | 'error' | 'info' }
let pushToast: ((t: Omit<Toast, 'id'>) => void) | null = null

export const toast = {
  success: (message: string) => pushToast?.({ message, tone: 'success' }),
  error: (message: string) => pushToast?.({ message, tone: 'error' }),
  info: (message: string) => pushToast?.({ message, tone: 'info' }),
}

export function ToastHost() {
  const [items, setItems] = useState<Array<Toast>>([])

  useEffect(() => {
    pushToast = (t) => {
      const id = Date.now() + Math.random()
      setItems((prev) => [...prev, { ...t, id }])
      setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), 4200)
    }
    return () => {
      pushToast = null
    }
  }, [])

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[60] flex flex-col items-center gap-2 px-3">
      {items.map((t) => (
        <div
          key={t.id}
          className={cx(
            'animate-rise pointer-events-auto w-full max-w-sm rounded-xl border px-4 py-3 text-[13.5px] shadow-2xl backdrop-blur',
            t.tone === 'success' && 'border-moss/50 bg-ink-900/95 text-moss',
            t.tone === 'error' && 'border-ember/50 bg-ink-900/95 text-ember',
            t.tone === 'info' && 'border-ink-600 bg-ink-900/95 text-fog-100',
          )}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
