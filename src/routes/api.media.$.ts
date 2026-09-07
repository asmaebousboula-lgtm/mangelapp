import { createFileRoute } from '@tanstack/react-router'
import { currentUser } from '../server/auth.server'
import { getMedia, isValidMediaKey } from '../server/media.server'

/** Photos are private: every read is checked against the session. */
export const Route = createFileRoute('/api/media/$')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const user = await currentUser()
        if (!user) return new Response('Nicht angemeldet.', { status: 401 })

        const key = (params as { _splat?: string })._splat ?? ''
        if (!isValidMediaKey(key)) return new Response('Ungültiger Verweis.', { status: 400 })

        const media = await getMedia(key)
        if (!media) return new Response('Nicht gefunden.', { status: 404 })

        return new Response(media.data, {
          headers: {
            'content-type': media.mimeType,
            'content-length': String(media.data.byteLength),
            // Keys are content-addressed UUIDs, so the bytes never change.
            'cache-control': 'private, max-age=31536000, immutable',
          },
        })
      },
    },
  },
})
