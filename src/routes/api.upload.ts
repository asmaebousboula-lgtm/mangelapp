import { createFileRoute } from '@tanstack/react-router'
import { currentUser } from '../server/auth.server'
import { ALLOWED_TYPES, MAX_UPLOAD_BYTES, putMedia } from '../server/media.server'

/**
 * Single-file upload endpoint. The client compresses photos before sending, so
 * each request stays small and a batch of photos uploads in parallel.
 */
export const Route = createFileRoute('/api/upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await currentUser()
        if (!user) return Response.json({ error: 'Nicht angemeldet.' }, { status: 401 })

        const form = await request.formData().catch(() => null)
        const file = form?.get('file')
        if (!(file instanceof File)) {
          return Response.json({ error: 'Es wurde keine Datei übermittelt.' }, { status: 400 })
        }

        const scope = form.get('scope') === 'import' ? 'imports' : 'tickets'
        if (scope === 'imports' && user.role !== 'admin') {
          return Response.json({ error: 'Keine Berechtigung.' }, { status: 403 })
        }

        const mimeType = file.type || 'application/octet-stream'
        if (!ALLOWED_TYPES.includes(mimeType)) {
          return Response.json({ error: `Dateityp ${mimeType} wird nicht unterstützt.` }, { status: 415 })
        }
        if (file.size > MAX_UPLOAD_BYTES) {
          return Response.json({ error: 'Die Datei ist zu groß (max. 8 MB).' }, { status: 413 })
        }

        const stored = await putMedia(scope, await file.arrayBuffer(), mimeType, file.name)
        return Response.json(stored, { status: 201 })
      },
    },
  },
})
