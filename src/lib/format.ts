const tz = 'Europe/Berlin'

const dateFmt = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: tz,
})

const timeFmt = new Intl.DateTimeFormat('de-DE', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: tz,
})

const dayFmt = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: '2-digit',
  month: 'long',
  timeZone: tz,
})

const toDate = (v: string | number | Date | null | undefined) => (v == null ? null : new Date(v))

export const fmtDate = (v: string | number | Date | null | undefined) => {
  const d = toDate(v)
  return d ? dateFmt.format(d) : '—'
}

export const fmtTime = (v: string | number | Date | null | undefined) => {
  const d = toDate(v)
  return d ? timeFmt.format(d) : '—'
}

export const fmtDateTime = (v: string | number | Date | null | undefined) => {
  const d = toDate(v)
  return d ? `${dateFmt.format(d)} · ${timeFmt.format(d)}` : '—'
}

export const fmtDay = (v: string | number | Date | null | undefined) => {
  const d = toDate(v)
  return d ? dayFmt.format(d) : '—'
}

/** Compact relative label used in lists ("vor 12 Min.", "vor 3 Std.", "3 Tage"). */
export const fmtAgo = (v: string | number | Date | null | undefined) => {
  const d = toDate(v)
  if (!d) return '—'
  const secs = Math.round((Date.now() - d.getTime()) / 1000)
  if (secs < 60) return 'gerade eben'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `vor ${mins} Min.`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `vor ${hours} Std.`
  const days = Math.round(hours / 24)
  if (days < 31) return `vor ${days} ${days === 1 ? 'Tag' : 'Tagen'}`
  return fmtDate(d)
}

export const initials = (first: string, last: string) =>
  `${first.trim().charAt(0)}${last.trim().charAt(0)}`.toUpperCase() || '?'

export const fullName = (u: { firstName: string; lastName: string } | null | undefined) =>
  u ? `${u.firstName} ${u.lastName}`.trim() : ''

export const fmtBytes = (n: number) => {
  if (!n) return '0 KB'
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
