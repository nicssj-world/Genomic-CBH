import 'server-only'

import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { buildQcMeasurementsTemplatePayload } from '@/lib/nipt/qc-measurements-template'
import type { BatchDetail, QcSheet } from '@/lib/nipt/types'
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

async function runExport(batch: BatchDetail, qcSheet: QcSheet) {
  const templatePath = process.env.NIPT_TASK_LIST_TEMPLATE || join(process.cwd(), 'templates', TEMPLATE_FILE_NAME)
  const scriptPath = join(process.cwd(), 'scripts', 'export-qc-measurements.ps1')
  await assertFileExists(templatePath, 'QC workbook template is missing')
  await assertFileExists(scriptPath, 'QC export script is missing')

  const workDir = await mkdtemp(join(tmpdir(), 'nipt-qc-measurements-'))
  const inputPath = join(workDir, 'payload.json')
  const outputPath = join(workDir, 'qc-measurements.pdf')
  try {
    await writeFile(/* turbopackIgnore: true */ inputPath, JSON.stringify(buildQcMeasurementsTemplatePayload(batch, qcSheet)), 'utf8')
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
    console.error('QC Measurements PDF export failed', error)
    throw new HttpError(500, 'QC Measurements PDF export failed. Confirm that Microsoft Excel is installed on this local server.')
  } finally {
    await rm(/* turbopackIgnore: true */ workDir, { recursive: true, force: true })
  }
}

export async function exportQcMeasurementsPdf(batch: BatchDetail, qcSheet: QcSheet) {
  return queueExcelExport(() => runExport(batch, qcSheet))
}
