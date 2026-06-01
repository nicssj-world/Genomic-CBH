import { randomUUID } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

function argument(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const root = resolve(argument('root') ?? process.env.NIPT_STORAGE_ROOT ?? './storage-dev')
const probe = resolve(root, `.nipt-storage-check-${randomUUID()}.tmp`)
const contents = `NIPT storage check ${new Date().toISOString()}`

await mkdir(root, { recursive: true })
try {
  await writeFile(probe, contents, { flag: 'wx' })
  const readBack = await readFile(probe, 'utf8')
  if (readBack !== contents) throw new Error('Storage read-back did not match the probe file')
  console.log(`Storage read/write check passed: ${root}`)
} finally {
  await unlink(probe).catch(() => undefined)
}
