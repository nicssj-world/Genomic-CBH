import 'server-only'

import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { BatchDetail } from '@/lib/nipt/types'
import { buildTaskSheetTemplatePayload } from '@/lib/nipt/task-sheet-template'
import { queueExcelExport } from '@/lib/server/excel-export-queue'
import { HttpError } from '@/lib/server/errors'

const execFileAsync = promisify(execFile)
const TEMPLATE_FILE_NAME = 'NIPT Experimental Task List-G50_TH_CBH.xlsm'

async function assertFileExists(filePath: string, message: string) {
  try {
    const info = await stat(/* turbopackIgnore: true */ filePath)
    if (!info.isFile()) throw new Error('Not a file')
  } catch {
    throw new HttpError(500, message)
  }
}

async function runExport(batch: BatchDetail, sheetNumber: number) {
  const templatePath = process.env.NIPT_TASK_LIST_TEMPLATE || join(process.cwd(), 'templates', TEMPLATE_FILE_NAME)
  const scriptPath = join(process.cwd(), 'scripts', 'export-task-sheet.ps1')
  await assertFileExists(templatePath, 'Task List workbook template is missing')
  await assertFileExists(scriptPath, 'Task List export script is missing')

  const workDir = await mkdtemp(join(tmpdir(), 'nipt-task-sheet-'))
  const inputPath = join(workDir, 'payload.json')
  const outputPath = join(workDir, 'task-list.pdf')
  try {
    await writeFile(/* turbopackIgnore: true */ inputPath, JSON.stringify(buildTaskSheetTemplatePayload(batch, sheetNumber)), 'utf8')
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
    console.error('Task List PDF export failed', error)
    throw new HttpError(500, 'Task List PDF export failed. Confirm that Microsoft Excel is installed on this local server.')
  } finally {
    await rm(/* turbopackIgnore: true */ workDir, { recursive: true, force: true })
  }
}

export async function exportTaskSheetPdf(batch: BatchDetail, sheetNumber: number) {
  return queueExcelExport(() => runExport(batch, sheetNumber))
}
