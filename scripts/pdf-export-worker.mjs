/**
 * Private Windows Excel PDF worker. Listen only on loopback.
 * Publish through a hospital-approved authenticated HTTPS tunnel.
 */
import { execFile } from 'node:child_process'
import { timingSafeEqual } from 'node:crypto'
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execAsync = promisify(execFile)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const secret = process.env.NIPT_PDF_WORKER_TOKEN || ''
const host = process.env.NIPT_PDF_WORKER_BIND_HOST || '127.0.0.1'
const port = Number(process.env.NIPT_PDF_WORKER_PORT || '3907')
const limit = 256 * 1024
const jobs = {
  'task-list': { template: 'NIPT Task List 2026.xlsx', env: 'NIPT_TASK_LIST_TEMPLATE', script: 'export-task-sheet.ps1' },
  'qc-measurements': { template: 'NIPT Task List 2026.xlsx', env: 'NIPT_TASK_LIST_TEMPLATE', script: 'export-qc-measurements.ps1' },
  'sample-storage': { template: 'Fm-WI-T-BM17-04-sample-storage.xlsx', env: 'NIPT_SAMPLE_STORAGE_TEMPLATE', script: 'export-sample-storage.ps1' },
}
if (process.platform !== 'win32') throw new Error('Worker requires Windows and installed Microsoft Excel')
if (secret.length < 32) throw new Error('NIPT_PDF_WORKER_TOKEN must be at least 32 characters')
if (host !== '127.0.0.1' && host !== '::1') throw new Error('Worker must bind to loopback only')
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid worker port')

function authorized(header) {
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false
  const provided = Buffer.from(header.slice(7))
  const expected = Buffer.from(secret)
  return provided.length === expected.length && timingSafeEqual(provided, expected)
}
function respond(res, code, error) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify({ error }))
}
async function readPayload(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) {
      const e = new Error('Request too large')
      e.status = 413
      throw e
    }
    chunks.push(chunk)
  }
  const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    const e = new Error('Invalid payload')
    e.status = 400
    throw e
  }
  return payload
}
let queue = Promise.resolve()
function serial(job) {
  const current = queue.then(job)
  queue = current.then(() => undefined, () => undefined)
  return current
}
async function convert(kind, payload) {
  const job = jobs[kind]
  const dir = await mkdtemp(join(tmpdir(), 'nipt-worker-'))
  try {
    const input = join(dir, 'payload.json')
    const output = join(dir, 'result.pdf')
    await writeFile(input, JSON.stringify(payload), 'utf8')
    await execAsync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', join(root, 'scripts', job.script),
      '-TemplatePath', process.env[job.env] || join(root, 'templates', job.template),
      '-InputPath', input, '-OutputPath', output,
    ], { timeout: 120_000, windowsHide: true, maxBuffer: 1024 * 1024 })
    const pdf = await readFile(output)
    if (pdf.length < 5 || pdf.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new Error('Excel returned invalid PDF')
    }
    if (pdf.length > 20_000_000) throw new Error('PDF exceeds size limit')
    return pdf
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  if (req.method === 'GET' && req.url === '/health') {
    respond(res, 200, 'ok')
    return
  }
  const match = /^\/v1\/pdf\/(task-list|qc-measurements|sample-storage)$/.exec(req.url || '')
  if (req.method !== 'POST' || !match) return respond(res, 404, 'Not found')
  if (!authorized(req.headers.authorization)) return respond(res, 401, 'Unauthorized')
  if (!req.headers['content-type']?.startsWith('application/json')) return respond(res, 415, 'JSON required')
  try {
    const payload = await readPayload(req)
    const pdf = await serial(() => convert(match[1], payload))
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Length': pdf.length,
      'Cache-Control': 'private, no-store',
    })
    res.end(pdf)
  } catch (error) {
    // Never log patient/sample payload.
    console.error('Excel PDF worker failed for ' + match[1], error)
    respond(res, error?.status || 500, 'PDF conversion failed')
  }
})
server.requestTimeout = 150_000
server.listen(port, host, () => console.log('NIPT PDF worker ready on loopback port ' + port))
