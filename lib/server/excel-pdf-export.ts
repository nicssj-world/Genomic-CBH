import 'server-only'

import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { HttpError } from '@/lib/server/errors'

export type ExportKind = 'task-list' | 'qc-measurements' | 'sample-storage'

const jobs: Record<ExportKind, { template: string; env: string; script: string }> = {
  'task-list': { template: 'NIPT Task List 2026.xlsx', env: 'NIPT_TASK_LIST_TEMPLATE', script: 'export-task-sheet.ps1' },
  'qc-measurements': { template: 'NIPT Task List 2026.xlsx', env: 'NIPT_TASK_LIST_TEMPLATE', script: 'export-qc-measurements.ps1' },
  'sample-storage': { template: 'Fm-WI-T-BM17-04-sample-storage.xlsx', env: 'NIPT_SAMPLE_STORAGE_TEMPLATE', script: 'export-sample-storage.ps1' },
}
const execAsync = promisify(execFile)

function assertPdf(bytes: Buffer): Buffer {
  if (bytes.length < 5 || bytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new HttpError(502, 'Windows PDF worker did not return a valid PDF.')
  }
  return bytes
}

async function localExcelPdf(kind: ExportKind, payload: unknown): Promise<Buffer> {
  const job = jobs[kind]
  const folder = await mkdtemp(join(tmpdir(), 'nipt-pdf-'))
  try {
    const input = join(folder, 'payload.json')
    const output = join(folder, 'result.pdf')
    await writeFile(input, JSON.stringify(payload), 'utf8')
    await execAsync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', join(process.cwd(), 'scripts', job.script),
      '-TemplatePath', process.env[job.env] || join(process.cwd(), 'templates', job.template),
      '-InputPath', input, '-OutputPath', output,
    ], { timeout: 120_000, windowsHide: true })
    return assertPdf(await readFile(output))
  } catch (error) {
    console.error('NIPT local Excel PDF export failed (' + kind + ')', error)
    throw new HttpError(502, 'Excel PDF export failed on Windows; check the server log.')
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
}

async function remoteExcelPdf(kind: ExportKind, payload: unknown, endpoint: string): Promise<Buffer> {
  const secret = process.env.NIPT_PDF_WORKER_TOKEN
  if (!secret || secret.length < 32) {
    throw new HttpError(503, 'NIPT PDF worker token is missing or too short.')
  }
  let url: URL
  try {
    url = new URL(endpoint.replace(/\/+$/, '') + '/v1/pdf/' + kind)
  } catch {
    throw new HttpError(503, 'NIPT PDF worker URL is invalid.')
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new HttpError(503, 'NIPT PDF worker requires an HTTPS URL without embedded credentials.')
  }
  const headers: Record<string, string> = {
    Authorization: 'Bearer ' + secret,
    'Content-Type': 'application/json',
    Accept: 'application/pdf',
  }
  if (process.env.NIPT_PDF_WORKER_CF_ACCESS_CLIENT_ID && process.env.NIPT_PDF_WORKER_CF_ACCESS_CLIENT_SECRET) {
    headers['CF-Access-Client-Id'] = process.env.NIPT_PDF_WORKER_CF_ACCESS_CLIENT_ID
    headers['CF-Access-Client-Secret'] = process.env.NIPT_PDF_WORKER_CF_ACCESS_CLIENT_SECRET
  }
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal: AbortSignal.timeout(55_000),
    })
  } catch (error) {
    console.error('NIPT PDF worker connection failed (' + kind + ')', error)
    throw new HttpError(502, 'Cannot reach the Windows PDF worker; check the secure tunnel.')
  }
  if (!response.ok) {
    console.error('NIPT PDF worker responded with HTTP ' + response.status + ' for ' + kind)
    throw new HttpError(502, 'Windows PDF export failed (HTTP ' + response.status + '); check the worker log.')
  }
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/pdf')) {
    throw new HttpError(502, 'Windows PDF worker returned a non-PDF response.')
  }
  const declaredLength = Number(response.headers.get('content-length'))
  if (declaredLength > 20_000_000) throw new HttpError(502, 'Windows PDF is too large.')
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length > 20_000_000) throw new HttpError(502, 'Windows PDF is too large.')
  return assertPdf(bytes)
}

/** Exact approved Excel template rendering, local Windows or secure Windows worker. */
export async function renderApprovedExcelPdf(kind: ExportKind, payload: unknown): Promise<Buffer> {
  const endpoint = process.env.NIPT_PDF_WORKER_URL?.trim()
  if (endpoint) return remoteExcelPdf(kind, payload, endpoint)
  if (process.platform === 'win32') return localExcelPdf(kind, payload)
  throw new HttpError(
    503,
    'PDF export on Vercel requires a secure Windows Excel worker. Configure NIPT_PDF_WORKER_URL and NIPT_PDF_WORKER_TOKEN.',
  )
}
