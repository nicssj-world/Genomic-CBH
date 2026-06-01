import { requireActor } from '@/lib/server/auth'
import { writeAudit } from '@/lib/server/data'
import { HttpError } from '@/lib/server/errors'
import { respond } from '@/lib/server/route'
import { MAX_UPLOAD_BYTES, writeStorageObject } from '@/lib/server/storage'

export async function PUT(request: Request) {
  return respond(async () => {
    const actor = await requireActor()
    const key = new URL(request.url).searchParams.get('key')
    if (!key) throw new HttpError(400, 'Storage key is required')

    const contentLength = Number(request.headers.get('content-length') ?? 0)
    if (contentLength > MAX_UPLOAD_BYTES) throw new HttpError(413, 'File exceeds 50 MB')

    const bytes = new Uint8Array(await request.arrayBuffer())
    await writeStorageObject(key, bytes)
    await writeAudit(actor, 'storage.upload', 'storage-object', key, { fileSize: bytes.byteLength })
    return { ok: true }
  })
}
