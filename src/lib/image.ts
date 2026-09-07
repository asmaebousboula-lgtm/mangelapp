export type UploadedMedia = { key: string; mimeType: string; size: number; name: string }

const MAX_DIMENSION = 1800
const QUALITY = 0.82

/**
 * Downscales and re-encodes a photo in the browser before upload. Phone
 * cameras produce 4–8 MB files; this brings them to ~200–500 KB so the app
 * stays quick on hotel wifi. Falls back to the original file if the browser
 * cannot decode it (e.g. some HEIC variants).
 */
export async function compressImage(file: File): Promise<{ blob: Blob; mimeType: string; name: string }> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') {
    return { blob: file, mimeType: file.type || 'application/octet-stream', name: file.name }
  }
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY))
    if (!blob) throw new Error('encode failed')

    // Keep the original when re-encoding did not actually help.
    if (blob.size >= file.size && scale === 1) {
      return { blob: file, mimeType: file.type, name: file.name }
    }
    return { blob, mimeType: 'image/jpeg', name: file.name.replace(/\.\w+$/, '') + '.jpg' }
  } catch {
    return { blob: file, mimeType: file.type, name: file.name }
  }
}

export async function uploadMedia(
  blob: Blob,
  name: string,
  scope: 'ticket' | 'import' = 'ticket',
): Promise<UploadedMedia> {
  const form = new FormData()
  form.append('file', blob, name)
  form.append('scope', scope)
  const res = await fetch('/api/upload', { method: 'POST', body: form })
  if (!res.ok) {
    const payload = await res.json().catch(() => null)
    throw new Error(payload?.error ?? `Upload fehlgeschlagen (${res.status})`)
  }
  return (await res.json()) as UploadedMedia
}

export async function compressAndUpload(file: File, scope: 'ticket' | 'import' = 'ticket') {
  const { blob, mimeType, name } = await compressImage(file)
  return uploadMedia(new Blob([blob], { type: mimeType }), name, scope)
}
