import 'server-only'

import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { buildSampleStorageTemplatePayload } from '@/lib/nipt/sample-storage-template'
import type { StorageBox } from '@/lib/nipt/types'
import { queueExcelExport } from '@/lib/server/excel-export-queue'
import { HttpError } from '@/lib/server/errors'

const execFileAsync = promisify(execFile)
const TEMPLATE_FILE_NAME = 'Fm-WI-T-BM17-04-sample-storage.xlsx'

async function assertFileExists(filePath: string, message: string) {
  try {
    const info = await stat(/* turbopackIgnore: true */ filePath)
    if (!info.isFile()) throw new Error('Not a file')
  } catch {
    throw new HttpError(500, message)
  }
}

async function runExport(box: StorageBox) {
  const templatePath = process.env.NIPT_SAMPLE_STORAGE_TEMPLATE || join(process.cwd(), 'templates', TEMPLATE_FILE_NAME)
  const scriptPath = join(process.cwd(), 'scripts', 'export-sample-storage.ps1')
  await assertFileExists(templatePath, 'Sample Storage workbook template is missing')
  await assertFileExists(scriptPath, 'Sample Storage export script is missing')

  const workDir = await mkdtemp(join(tmpdir(), 'nipt-sample-storage-'))
  const inputPath = join(workDir, 'payload.json')
  const outputPath = join(workDir, 'sample-storage.pdf')
  try {
    await writeFile(/* turbopackIgnore: true */ inputPath, JSON.stringify(buildSampleStorageTemplatePayload(box)), 'utf8')
    await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
      '-TemplatePath',
      templatePath,
      '-InputPath',
      inputPath,
      '-OutputPath',
      outputPath,
    ], { timeout: 120_000, windowsHide: true })
    return await readFile(/* turbopackIgnore: true */ outputPath)
  } catch (error) {
    console.error('Sample Storage PDF export failed', error)
    throw new HttpError(500, 'Sample Storage PDF export failed. Confirm that Microsoft Excel is installed on this local server.')
  } finally {
    await rm(/* turbopackIgnore: true */ workDir, { recursive: true, force: true })
  }
}

export async function exportSampleStoragePdf(box: StorageBox) {
  return queueExcelExport(() => runExport(box))
}
