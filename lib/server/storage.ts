import 'server-only'

import { mkdir, open, readFile, stat, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'
import { HttpError } from '@/lib/server/errors'
import { requireEnv } from '@/lib/supabase/env'
import { isAllowedStorageKey, resolveStoragePath, safeFileName } from '@/lib/storage/path'

export { safeFileName }

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

function getStoragePath(key: string) {
  try {
    return resolveStoragePath(requireEnv('NIPT_STORAGE_ROOT'), key)
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : 'Invalid storage key')
  }
}

export function createUploadUrl(key: string) {
  if (!isAllowedStorageKey(key)) throw new HttpError(400, 'Invalid storage key')
  return `/api/storage/upload?key=${encodeURIComponent(key)}`
}

export function createDownloadUrl(revisionId: string) {
  return `/api/results/${encodeURIComponent(revisionId)}/file`
}

export async function writeStorageObject(key: string, bytes: Uint8Array) {
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new HttpError(400, 'File must be between 1 byte and 50 MB')
  }

  const filePath = getStoragePath(key)
  await mkdir(/* turbopackIgnore: true */ dirname(filePath), { recursive: true })
  let handle
  try {
    handle = await open(/* turbopackIgnore: true */ filePath, 'wx')
    await handle.writeFile(bytes)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new HttpError(409, 'Storage object already exists')
    await unlink(/* turbopackIgnore: true */ filePath).catch(() => undefined)
    throw error
  } finally {
    await handle?.close()
  }
}

export async function getStorageObjectInfo(key: string) {
  try {
    const info = await stat(/* turbopackIgnore: true */ getStoragePath(key))
    if (!info.isFile()) throw new HttpError(404, 'Storage object not found')
    return { size: info.size }
  } catch (error) {
    if (error instanceof HttpError) throw error
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new HttpError(404, 'Storage object not found')
    throw error
  }
}

export async function readStorageObject(key: string) {
  try {
    return await readFile(/* turbopackIgnore: true */ getStoragePath(key))
  } catch (error) {
    if (error instanceof HttpError) throw error
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new HttpError(404, 'Storage object not found')
    throw error
  }
}
