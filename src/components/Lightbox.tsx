import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { fmtDateTime } from '../lib/format'

export type LightboxPhoto = {
  blobKey: string
  phase: string
  id: number
  /** Who uploaded it — every photo stays attributed to an employee. */
  uploadedByName?: string | null
  createdAt?: string | Date
}

/** Full-screen photo viewer with keyboard and swipe navigation. */
export function Lightbox({
  photos,
  index,
  onClose,
}: {
  photos: Array<LightboxPhoto>
  index: number
  onClose: () => void
}) {
  const [i, setI] = useState(index)
  const [touchX, setTouchX] = useState<number | null>(null)

  useEffect(() => setI(index), [index])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setI((v) => (v + 1) % photos.length)
      if (e.key === 'ArrowLeft') setI((v) => (v - 1 + photos.length) % photos.length)
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose, photos.length])

  const photo = photos[i]
  if (!photo) return null

  return (
    <div
      className="animate-fade fixed inset-0 z-[70] flex flex-col bg-ink-950/97"
      onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX == null) return
        const dx = e.changedTouches[0].clientX - touchX
        if (Math.abs(dx) > 60) setI((v) => (v + (dx < 0 ? 1 : -1) + photos.length) % photos.length)
        setTouchX(null)
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <span className="eyebrow">
          {photo.phase === 'after' ? 'Nach Reparatur' : 'Vor Reparatur'} · {i + 1}/{photos.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Schließen"
          className="tap grid size-10 place-items-center rounded-xl border border-ink-700 bg-ink-900 text-fog-200"
        >
          <X className="size-5" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-4">
        <img
          src={`/api/media/${photo.blobKey}`}
          alt=""
          className="max-h-full max-w-full rounded-xl object-contain"
          draggable={false}
        />
        {photos.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Vorheriges Foto"
              onClick={() => setI((v) => (v - 1 + photos.length) % photos.length)}
              className="tap absolute left-2 grid size-11 place-items-center rounded-full border border-ink-700 bg-ink-900/85 text-fog-200"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              aria-label="Nächstes Foto"
              onClick={() => setI((v) => (v + 1) % photos.length)}
              className="tap absolute right-2 grid size-11 place-items-center rounded-full border border-ink-700 bg-ink-900/85 text-fog-200"
            >
              <ChevronRight className="size-5" />
            </button>
          </>
        )}
      </div>

      {(photo.uploadedByName || photo.createdAt) && (
        <p className="px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-[12.5px] text-fog-400">
          {photo.uploadedByName ? `Hochgeladen von ${photo.uploadedByName}` : 'Hochgeladen'}
          {photo.createdAt ? ` · ${fmtDateTime(photo.createdAt)}` : ''}
        </p>
      )}
    </div>
  )
}
