import { isAbsolute, relative, resolve } from 'node:path'

const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/
const STORAGE_PREFIXES = ['his-imports/', 'qubit-imports/', 'results/'] as const

export function safeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
}

export function isAllowedStorageKey(key: string) {
  if (!STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) return false
  if (!key || key.length > 600 || key.includes('\\') || key.startsWith('/')) return false
  return key.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..' && SAFE_SEGMENT.test(segment))
}

export function resolveStoragePath(root: string, key: string) {
  if (!root.trim()) throw new Error('Storage root is required')
  if (!isAllowedStorageKey(key)) throw new Error('Invalid storage key')

  // The storage root is a runtime NAS mount, not a build-time file dependency.
  const resolvedRoot = resolve(/* turbopackIgnore: true */ root)
  const resolvedPath = resolve(/* turbopackIgnore: true */ resolvedRoot, ...key.split('/'))
  const relativePath = relative(resolvedRoot, resolvedPath)

  if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error('Storage key resolves outside storage root')
  }
  return resolvedPath
}
