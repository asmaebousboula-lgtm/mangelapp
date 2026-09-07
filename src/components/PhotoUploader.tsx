import { useEffect, useRef, useState } from 'react'
import { Camera, ImagePlus, Loader2, X } from 'lucide-react'
import { compressAndUpload, type UploadedMedia } from '../lib/image'
import { cx, toast } from './ui'
import { fmtBytes } from '../lib/format'

type Pending = { id: string; previewUrl: string; name: string; error?: string }

/**
 * Camera-first photo picker: it compresses each image in the browser, uploads
 * it straight away and reports the resulting blob keys upwards.
 */
export function PhotoUploader({
  value,
  onChange,
  max = 8,
  label = 'Fotos',
  hint,
  compact,
}: {
  value: Array<UploadedMedia>
  onChange: (next: Array<UploadedMedia>) => void
  max?: number
  label?: string
  hint?: string
  compact?: boolean
}) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<Array<Pending>>([])
  const previews = useRef<Array<string>>([])

  useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), [])

  const remaining = max - value.length - pending.length

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return
    const list = Array.from(files).slice(0, Math.max(0, remaining))
    if (!list.length) {
      toast.error(`Maximal ${max} Fotos pro Meldung.`)
      return
    }

    const entries: Array<Pending> = list.map((file, i) => {
      const previewUrl = URL.createObjectURL(file)
      previews.current.push(previewUrl)
      return { id: `${Date.now()}-${i}-${file.name}`, previewUrl, name: file.name }
    })
    setPending((prev) => [...prev, ...entries])

    await Promise.all(
      list.map(async (file, i) => {
        const entry = entries[i]
        try {
          const uploaded = await compressAndUpload(file)
          onChange([...value, uploaded].slice(0, max))
          setPending((prev) => prev.filter((p) => p.id !== entry.id))
        } catch (err) {
          setPending((prev) =>
            prev.map((p) => (p.id === entry.id ? { ...p, error: (err as Error).message } : p)),
          )
          toast.error((err as Error).message)
        }
      }),
    )
  }

  return (
    <div>
      {label && <span className="label">{label}</span>}

      <div className={cx('grid gap-2', compact ? 'grid-cols-4' : 'grid-cols-3 sm:grid-cols-4')}>
        {value.map((media) => (
          <figure
            key={media.key}
            className="group relative aspect-square overflow-hidden rounded-xl border border-ink-700 bg-ink-850"
          >
            <img src={`/api/media/${media.key}`} alt="" className="size-full object-cover" />
            <button
              type="button"
              aria-label="Foto entfernen"
              onClick={() => onChange(value.filter((v) => v.key !== media.key))}
              className="absolute right-1 top-1 grid size-7 place-items-center rounded-lg border border-ink-600 bg-ink-950/85 text-fog-200 opacity-90 hover:text-ember"
            >
              <X className="size-3.5" />
            </button>
            <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950/90 to-transparent px-1.5 pb-1 pt-4 font-mono text-[9.5px] text-fog-300">
              {fmtBytes(media.size)}
            </figcaption>
          </figure>
        ))}

        {pending.map((p) => (
          <figure
            key={p.id}
            className="relative aspect-square overflow-hidden rounded-xl border border-ink-700 bg-ink-850"
          >
            <img src={p.previewUrl} alt="" className="size-full object-cover opacity-35" />
            <span className="absolute inset-0 grid place-items-center">
              {p.error ? (
                <X className="size-5 text-ember" />
              ) : (
                <Loader2 className="size-5 animate-spin text-brass-400" />
              )}
            </span>
          </figure>
        ))}

        {remaining > 0 && (
          <>
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="tap grid aspect-square place-items-center gap-1 rounded-xl border border-dashed border-ink-600 bg-ink-900/60 text-fog-400 hover:border-brass-500 hover:text-brass-300"
            >
              <Camera className="size-6" />
              <span className="text-[11px]">Kamera</span>
            </button>
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              className="tap grid aspect-square place-items-center gap-1 rounded-xl border border-dashed border-ink-600 bg-ink-900/60 text-fog-400 hover:border-brass-500 hover:text-brass-300"
            >
              <ImagePlus className="size-6" />
              <span className="text-[11px]">Galerie</span>
            </button>
          </>
        )}
      </div>

      {hint && <p className="mt-2 text-[12.5px] text-fog-500">{hint}</p>}

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          void handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          void handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
