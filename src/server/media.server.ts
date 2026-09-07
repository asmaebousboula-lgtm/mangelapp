import { randomUUID } from 'node:crypto'
import { getStore } from '@netlify/blobs'

const STORE = 'hd-technik-media'

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
}

export const ALLOWED_TYPES = Object.keys(EXT_BY_TYPE)
/** Hard ceiling; the client already downscales photos before uploading. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

const store = () => getStore(STORE)

export async function putMedia(
  scope: 'tickets' | 'imports',
  data: ArrayBuffer,
  mimeType: string,
  originalName?: string,
) {
  const ext = EXT_BY_TYPE[mimeType] ?? 'bin'
  const key = `${scope}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${ext}`
  await store().set(key, data, {
    metadata: { mimeType, originalName: originalName ?? '', uploadedAt: new Date().toISOString() },
  })
  return { key, mimeType, size: data.byteLength, name: originalName ?? '' }
}

export async function getMedia(key: string) {
  const result = await store().getWithMetadata(key, { type: 'arrayBuffer' })
  if (!result) return null
  const mimeType = typeof result.metadata?.mimeType === 'string' ? result.metadata.mimeType : 'application/octet-stream'
  return { data: result.data as ArrayBuffer, mimeType }
}

export async function deleteMedia(key: string) {
  await store().delete(key)
}

/** Blob keys are opaque; reject anything that is not one of ours. */
export function isValidMediaKey(key: string) {
  return /^(tickets|imports)\/\d{4}-\d{2}\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/.test(key)
}
