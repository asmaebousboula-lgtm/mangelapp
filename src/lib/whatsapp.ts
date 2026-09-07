/**
 * WhatsApp export parser.
 *
 * Pure functions with no I/O so the same code can run in the browser (while
 * unpacking a ZIP export) and on the server (for a plain `_chat.txt` upload).
 *
 * Handles the two export dialects WhatsApp produces:
 *   iOS      [15.08.2026, 12:35:42] Anna: Dusche funktioniert nicht.
 *   Android  15.08.2026, 12:35 - Anna: Dusche funktioniert nicht.
 */

import { AREAS, type Priority } from './domain'

export type RawMessage = {
  index: number
  at: Date | null
  rawTimestamp: string
  sender: string | null
  text: string
  /** File names referenced by attachment markers in this message. */
  attachments: Array<string>
  /** `<Medien ausgeschlossen>` — media exists but was not part of the export. */
  mediaOmitted: boolean
  system: boolean
}

const LRM = /[‎‏‪-‮﻿]/g

const IOS_LINE = /^\[(\d{1,4}[./-]\d{1,2}[./-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?)(?:\s*([AaPp]\.?[Mm]\.?))?\]\s*(?:([^:]{1,80}):\s*)?([\s\S]*)$/
const ANDROID_LINE = /^(\d{1,4}[./-]\d{1,2}[./-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?)(?:\s*([AaPp]\.?[Mm]\.?))?\s+[-–]\s+(?:([^:]{1,80}):\s*)?([\s\S]*)$/

const ATTACH_PATTERNS = [
  /<\s*(?:Anhang|attached|adjunto|allegato|pièce jointe)\s*:\s*([^>]+?)\s*>/gi,
  /([\w\-. ()]+\.(?:jpe?g|png|webp|heic|gif|mp4|3gp|mov|m4a|opus|ogg|aac|pdf|docx?|zip))\s*\((?:Datei angehängt|file attached|archivo adjunto|file allegato)\)/gi,
]

const OMITTED = /<\s*(?:Medien ausgeschlossen|Media omitted|media omitted|Bild weggelassen|image omitted|video omitted|audio omitted|sticker omitted|GIF weggelassen)\s*>/i

const SYSTEM_HINTS = [
  'ende-zu-ende-verschlüsselt',
  'end-to-end encrypted',
  'hat die gruppe erstellt',
  'created group',
  'hat dich hinzugefügt',
  'hat sich der gruppe',
  'joined using this group',
  'ist der gruppe beigetreten',
  'hat die gruppenbeschreibung',
  'changed the group description',
  'hat das gruppenbild',
  'changed this group',
  'changed the subject',
  'hat den betreff',
  'hat die einstellungen',
  'nachrichten und anrufe',
  'messages and calls',
  'sicherheitsnummer',
  'security code changed',
  'hat diese nachricht gelöscht',
  'deleted this message',
  'this message was deleted',
  'du hast',
  'verpasster sprachanruf',
  'missed voice call',
  'missed video call',
]

function parseDateParts(dateStr: string, timeStr: string, ampm?: string): Date | null {
  const nums = dateStr.split(/[./-]/).map((n) => Number(n))
  if (nums.length !== 3 || nums.some((n) => Number.isNaN(n))) return null

  let day: number
  let month: number
  let year: number
  if (nums[0] > 31) {
    // ISO-ish: 2026-08-15
    ;[year, month, day] = nums as [number, number, number]
  } else if (nums[0] > 12 || nums[1] <= 12) {
    // German / European default: 15.08.2026
    ;[day, month, year] = nums as [number, number, number]
  } else {
    ;[month, day, year] = nums as [number, number, number]
  }
  if (year < 100) year += year > 70 ? 1900 : 2000

  const [hRaw, m, s] = timeStr.split(':').map((n) => Number(n))
  let h = hRaw
  if (ampm) {
    const pm = /p/i.test(ampm)
    if (pm && h < 12) h += 12
    if (!pm && h === 12) h = 0
  }
  const d = new Date(year, month - 1, day, h, m || 0, s || 0)
  return Number.isNaN(d.getTime()) ? null : d
}

function extractAttachments(text: string) {
  const found: Array<string> = []
  let cleaned = text
  for (const pattern of ATTACH_PATTERNS) {
    cleaned = cleaned.replace(pattern, (_full, name: string) => {
      const trimmed = name.trim()
      if (trimmed) found.push(trimmed)
      return ' '
    })
  }
  return { attachments: found, cleaned: cleaned.replace(/\s{2,}/g, ' ').trim() }
}

/** Splits a raw export into messages, merging continuation lines. */
export function parseChat(content: string): Array<RawMessage> {
  const lines = content.replace(LRM, '').replace(/\r\n?/g, '\n').split('\n')
  const messages: Array<RawMessage> = []

  const push = (dateStr: string, timeStr: string, ampm: string | undefined, sender: string | null, body: string) => {
    messages.push({
      index: messages.length,
      at: parseDateParts(dateStr, timeStr, ampm),
      rawTimestamp: `${dateStr}, ${timeStr}`,
      sender: sender?.trim() || null,
      text: body,
      attachments: [],
      mediaOmitted: false,
      system: false,
    })
  }

  for (const line of lines) {
    const ios = IOS_LINE.exec(line)
    const android = ios ? null : ANDROID_LINE.exec(line)
    const m = ios ?? android
    if (m) {
      push(m[1], m[2], m[3], m[4] ?? null, m[5] ?? '')
    } else if (messages.length && line.trim() !== '') {
      messages[messages.length - 1].text += `\n${line}`
    }
  }

  for (const msg of messages) {
    const { attachments, cleaned } = extractAttachments(msg.text)
    msg.attachments = attachments
    msg.mediaOmitted = OMITTED.test(msg.text)
    msg.text = cleaned.replace(OMITTED, '').trim()
    const lower = msg.text.toLowerCase()
    msg.system =
      msg.sender === null ||
      (msg.text !== '' && SYSTEM_HINTS.some((hint) => lower.startsWith(hint) || lower.includes(hint)))
  }

  return messages
}

/* ------------------------------------------------------ content recognition */

const ROOM_PATTERNS = [
  /\b(?:zimmer|zimmernr\.?|zi\.?|zim\.?|room|rm\.?|habitación)\s*(?:nr\.?|no\.?|#)?\s*(\d{1,4}[a-zA-Z]?)\b/i,
  /(?:^|\s)#\s*(\d{2,4}[a-zA-Z]?)\b/,
]

export function detectRoom(text: string): string | null {
  for (const pattern of ROOM_PATTERNS) {
    const m = pattern.exec(text)
    if (m) return m[1].toUpperCase()
  }
  // Bare 3–4 digit number that is not a year, price or time.
  const bare = /(?:^|[\s(])(\d{3,4})(?=[\s,.:;)!?]|$)/.exec(text)
  if (bare) {
    const n = Number(bare[1])
    if (n >= 100 && n <= 2000 && !(n >= 1900 && n <= 2100)) return bare[1]
  }
  return null
}

const HOTEL_HINTS: Record<string, Array<string>> = {
  unique: ['unique', 'dortmund', 'hdu', 'stammhaus'],
  majestic: ['majestic', 'majestik', 'maj'],
  imperial: ['imperial', 'imperiale', 'imp'],
  pearl: ['pearl', 'perl', 'perle'],
}

export function detectHotelSlug(text: string, slugs: Array<string>): string | null {
  const lower = ` ${text.toLowerCase()} `
  const hits = slugs.filter((slug) => {
    const hints = HOTEL_HINTS[slug] ?? [slug]
    return hints.some((h) => new RegExp(`[^a-zäöüß]${h}[^a-zäöüß]`, 'i').test(lower))
  })
  return hits.length === 1 ? hits[0] : null
}

const AREA_HINTS: Array<{ area: string; words: Array<string> }> = [
  { area: 'zimmer', words: ['zimmer', 'room', 'suite', 'apartment'] },
  { area: 'lobby', words: ['lobby', 'eingang', 'foyer'] },
  { area: 'rezeption', words: ['rezeption', 'reception', 'empfang', 'front desk'] },
  { area: 'restaurant', words: ['restaurant', 'frühstück', 'fruehstueck', 'breakfast', 'bar', 'speisesaal'] },
  { area: 'kueche', words: ['küche', 'kueche', 'kitchen', 'spülmaschine', 'spuelmaschine', 'geschirrspüler'] },
  { area: 'wc', words: ['wc', 'toilette', 'toilet', 'urinal', 'gäste-wc'] },
  { area: 'lager', words: ['lager', 'storage', 'wäschelager', 'waeschelager', 'housekeeping-lager'] },
  { area: 'fitness', words: ['fitness', 'gym', 'sauna', 'wellness', 'laufband'] },
  { area: 'flur', words: ['flur', 'gang', 'korridor', 'hallway', 'treppenhaus'] },
  { area: 'aufzug', words: ['aufzug', 'lift', 'elevator', 'fahrstuhl'] },
  { area: 'technikraum', words: ['technikraum', 'heizungsraum', 'keller', 'technik-raum', 'boiler'] },
  { area: 'aussen', words: ['außen', 'aussen', 'terrasse', 'parkplatz', 'garten', 'hof', 'fassade', 'einfahrt'] },
]

export function detectArea(text: string, hasRoom: boolean): string | null {
  if (hasRoom) return 'zimmer'
  const lower = text.toLowerCase()
  for (const { area, words } of AREA_HINTS) {
    if (words.some((w) => lower.includes(w))) return area
  }
  return null
}

const URGENT_STRONG = ['sehr dringend', 'notfall', 'sofort', 'wasserschaden', 'überschwemm', 'ueberschwemm', 'gefahr', 'stromausfall', 'kein strom', 'feuer', 'brand', 'asap']
const URGENT = ['dringend', 'eilt', 'schnell', 'gast wartet', 'gast beschwert', 'undicht', 'läuft aus', 'laeuft aus', 'kein warmwasser', 'defekt seit', 'urgent']

export function detectPriority(text: string): Priority {
  const lower = text.toLowerCase()
  if (URGENT_STRONG.some((w) => lower.includes(w))) return 'sehr_dringend'
  if (URGENT.some((w) => lower.includes(w))) return 'dringend'
  return 'normal'
}

const PROBLEM_WORDS = [
  'defekt', 'kaputt', 'funktioniert nicht', 'geht nicht', 'undicht', 'tropft', 'verstopft', 'locker',
  'läuft', 'laeuft', 'leckt', 'klemmt', 'lampe', 'licht', 'birne', 'heizung', 'klima', 'dusche', 'wc',
  'toilette', 'waschbecken', 'spülung', 'spuelung', 'tv', 'fernseher', 'fernbedienung', 'schloss', 'schlüssel',
  'karte', 'tür', 'tuer', 'fenster', 'rollo', 'jalousie', 'wasser', 'strom', 'steckdose', 'wlan', 'wifi',
  'internet', 'telefon', 'safe', 'föhn', 'foehn', 'minibar', 'kühlschrank', 'kuehlschrank', 'aufzug',
  'geräusch', 'geraeusch', 'laut', 'reparatur', 'reparieren', 'kein warmwasser', 'schimmel', 'riecht',
  'bitte prüfen', 'bitte pruefen', 'problem', 'störung', 'stoerung', 'ausgefallen',
]

/** Rough signal whether a chat message is a technical report at all. */
export function looksLikeReport(text: string) {
  const lower = text.toLowerCase()
  if (lower.length < 8) return false
  return PROBLEM_WORDS.some((w) => lower.includes(w)) || ROOM_PATTERNS.some((p) => p.test(text))
}

export function makeTitle(text: string, max = 72) {
  const firstLine = text.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? ''
  const sentence = firstLine.split(/(?<=[.!?])\s/)[0] || firstLine
  const clean = sentence.replace(/\s+/g, ' ').replace(/^[-•*]\s*/, '').trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 1).trimEnd()}…`
}

export type DraftEntry = {
  sortIndex: number
  reportedAt: string | null
  rawTimestamp: string
  sender: string | null
  rawText: string
  hotelSlug: string | null
  area: string | null
  roomNumber: string | null
  title: string
  description: string
  priority: Priority
  /** File names of attachments; resolved to blob keys during upload. */
  attachmentNames: Array<string>
  mediaOmitted: boolean
  include: boolean
  needsReview: boolean
  reviewReason: string | null
}

const MERGE_WINDOW_MS = 4 * 60 * 1000

/**
 * Turns raw chat messages into editable ticket drafts: merges consecutive
 * messages from the same sender, attaches trailing media-only messages and
 * flags everything it could not resolve confidently.
 */
export function buildDrafts(
  messages: Array<RawMessage>,
  options: { hotelSlugs: Array<string>; defaultHotelSlug?: string | null },
): Array<DraftEntry> {
  const groups: Array<{ base: RawMessage; texts: Array<string>; attachments: Array<string>; omitted: boolean }> = []

  for (const msg of messages) {
    if (msg.system) continue
    const last = groups[groups.length - 1]
    const mergeable =
      last &&
      last.base.sender === msg.sender &&
      last.base.at &&
      msg.at &&
      msg.at.getTime() - last.base.at.getTime() <= MERGE_WINDOW_MS

    // A media-only follow-up always belongs to the message before it.
    if (mergeable && (msg.text === '' || last.texts.join(' ').trim() === '')) {
      if (msg.text) last.texts.push(msg.text)
      last.attachments.push(...msg.attachments)
      last.omitted = last.omitted || msg.mediaOmitted
      continue
    }
    if (mergeable && msg.attachments.length && msg.text.length < 40) {
      last.texts.push(msg.text)
      last.attachments.push(...msg.attachments)
      last.omitted = last.omitted || msg.mediaOmitted
      continue
    }
    if (msg.text === '' && msg.attachments.length === 0 && !msg.mediaOmitted) continue

    groups.push({
      base: msg,
      texts: msg.text ? [msg.text] : [],
      attachments: [...msg.attachments],
      omitted: msg.mediaOmitted,
    })
  }

  return groups.map((group, i) => {
    const text = group.texts.join('\n').trim()
    const room = detectRoom(text)
    const area = detectArea(text, Boolean(room))
    const hotelSlug = detectHotelSlug(text, options.hotelSlugs) ?? options.defaultHotelSlug ?? null

    const reasons: Array<string> = []
    if (!hotelSlug) reasons.push('Hotel unklar')
    if (!area) reasons.push('Bereich unklar')
    if (area === 'zimmer' && !room) reasons.push('Zimmernummer fehlt')
    if (!text) reasons.push('Kein Text, nur Medien')
    if (text && !looksLikeReport(text)) reasons.push('Vielleicht keine Meldung')

    const validArea = area && AREAS.some((a) => a.value === area) ? area : null

    return {
      sortIndex: i,
      reportedAt: group.base.at ? group.base.at.toISOString() : null,
      rawTimestamp: group.base.rawTimestamp,
      sender: group.base.sender,
      rawText: text,
      hotelSlug,
      area: validArea,
      roomNumber: room,
      title: makeTitle(text) || 'Meldung aus WhatsApp',
      description: text,
      priority: detectPriority(text),
      attachmentNames: group.attachments,
      mediaOmitted: group.omitted,
      include: text.length > 0 ? looksLikeReport(text) : group.attachments.length > 0,
      needsReview: reasons.length > 0,
      reviewReason: reasons.length ? reasons.join(' · ') : null,
    }
  })
}
