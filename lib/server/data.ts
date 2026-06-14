import 'server-only'

import { randomUUID } from 'node:crypto'
import type { Actor, BatchDetail, BatchSlot, DashboardData, QcImport, QcSheet, QcWorkspace, ResultRevision, SampleRow, SampleStorageData, StorageBox, TaskSheet, UserRole } from '@/lib/nipt/types'
import { PREGNANCY_TYPES, RUN_TYPES, STAGES, formatBangkokIsoDate, formatRunSampleId, getStorageDueState, isGestationalAgeComplete, type PregnancyType, type RunType, type SampleStage, type StorageBoxType } from '@/lib/nipt/rules'
import { buildTaskSheetSourceRows } from '@/lib/nipt/task-sheet-template'
import { HttpError } from '@/lib/server/errors'
import { createDownloadUrl, createUploadUrl, getStorageObjectInfo, readStorageObject, safeFileName } from '@/lib/server/storage'
import { getAdminClient } from '@/lib/supabase/admin'

type RecordRow = Record<string, unknown>

function fail(error: { message: string } | null, message = 'Database operation failed') {
  if (error) throw new HttpError(400, error.message || message)
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function nullableString(value: unknown) {
  return typeof value === 'string' ? value : null
}

function nullableNumber(value: unknown) {
  return typeof value === 'number' ? value : null
}

function ids(rows: RecordRow[], key: string) {
  return [...new Set(rows.map((row) => asString(row[key])).filter(Boolean))]
}

export async function writeAudit(
  actor: Actor,
  action: string,
  entityType: string,
  entityId?: string,
  detail: Record<string, unknown> = {},
) {
  const { error } = await getAdminClient().from('nipt_audit_logs').insert({
    actor_id: actor.id,
    action,
    entity_type: entityType,
    entity_id: entityId ?? null,
    detail,
  })
  fail(error)
}

async function getNameMap(userIds: string[]) {
  if (!userIds.length) return new Map<string, string>()
  const { data, error } = await getAdminClient().from('nipt_users').select('id,display_name').in('id', userIds)
  fail(error)
  return new Map((data ?? []).map((row) => [row.id, row.display_name]))
}

async function getRevisionMap(sampleIds: string[]) {
  if (!sampleIds.length) return new Map<string, ResultRevision>()
  const { data, error } = await getAdminClient()
    .from('nipt_result_revisions')
    .select('id,sample_id,revision_number,file_name,file_size,uploaded_at,uploaded_by,is_active,voided_at,void_reason')
    .in('sample_id', sampleIds)
    .eq('is_active', true)
  fail(error)
  const rows = (data ?? []) as RecordRow[]
  const nameMap = await getNameMap(ids(rows, 'uploaded_by'))
  return new Map(
    rows.map((row) => [
      asString(row.sample_id),
      {
        id: asString(row.id),
        revisionNumber: Number(row.revision_number),
        fileName: asString(row.file_name),
        fileSize: Number(row.file_size),
        uploadedAt: asString(row.uploaded_at),
        uploadedByName: nameMap.get(asString(row.uploaded_by)) ?? null,
        isActive: Boolean(row.is_active),
        voidedAt: nullableString(row.voided_at),
        voidReason: nullableString(row.void_reason),
      },
    ]),
  )
}

export async function listSamples(options: { search?: string; limit?: number } = {}) {
  const admin = getAdminClient()
  let query = admin.from('nipt_samples').select('*').order('imported_at', { ascending: false }).limit(options.limit ?? 250)
  const search = options.search?.trim()
  if (search) query = query.or(`ln.ilike.%${search}%,hn.ilike.%${search}%,patient_name.ilike.%${search}%`)
  const { data: sampleData, error: sampleError } = await query
  fail(sampleError)
  const samples = (sampleData ?? []) as RecordRow[]
  if (!samples.length) return []

  const sampleIds = ids(samples, 'id')
  const { data: runData, error: runError } = await admin
    .from('nipt_sample_runs')
    .select('id,sample_id,run_type,stage')
    .in('sample_id', sampleIds)
    .eq('is_active', true)
  fail(runError)
  const runMap = new Map(((runData ?? []) as RecordRow[]).map((run) => [asString(run.sample_id), run]))
  const nameMap = await getNameMap(ids(samples, 'imported_by'))
  const revisionMap = await getRevisionMap(sampleIds)

  return samples.flatMap((sample): SampleRow[] => {
    const run = runMap.get(asString(sample.id))
    if (!run) return []
    const runType = asString(run.run_type) as RunType
    const pregnancyType = (PREGNANCY_TYPES.includes(asString(sample.pregnancy_type) as PregnancyType) ? asString(sample.pregnancy_type) : 'Single') as PregnancyType
    const effectiveLnHalos = pregnancyType === 'Twin' ? `${asString(sample.ln_halos)}D` : asString(sample.ln_halos)
    return [{
      id: asString(sample.id),
      ln: asString(sample.ln),
      lnHalos: effectiveLnHalos,
      importedAt: asString(sample.imported_at),
      importedByName: nameMap.get(asString(sample.imported_by)) ?? null,
      gaWeeks: nullableNumber(sample.ga_weeks),
      gaDays: nullableNumber(sample.ga_days),
      patientName: nullableString(sample.patient_name),
      idPassport: nullableString(sample.id_passport),
      hn: nullableString(sample.hn),
      dob: nullableString(sample.dob),
      doctor: nullableString(sample.doctor),
      collectionDate: nullableString(sample.collection_date),
      receivedDate: nullableString(sample.received_date),
      runId: asString(run.id),
      runType,
      stage: asString(run.stage) as SampleStage,
      pregnancyType,
      runSampleId: formatRunSampleId(effectiveLnHalos, runType),
      activeResult: revisionMap.get(asString(sample.id)) ?? null,
    }]
  })
}

export async function getSample(sampleId: string) {
  const sample = (await listSamples({ limit: 1000 })).find((row) => row.id === sampleId)
  if (!sample) throw new HttpError(404, 'Sample not found')
  return sample
}

export async function registerSample(ln: string, actor: Actor) {
  const { data, error } = await getAdminClient().rpc('register_nipt_sample', { p_ln: ln.trim(), p_actor: actor.id })
  fail(error)
  return data as { duplicate: boolean; sample_id: string; ln_halos: string }
}

export async function updateSample(
  sampleId: string,
  input: { gaWeeks?: number | null; gaDays?: number | null; stage?: SampleStage; runType?: RunType; pregnancyType?: PregnancyType },
  actor: Actor,
) {
  const admin = getAdminClient()
  const sample = await getSample(sampleId)
  if (input.gaWeeks !== undefined || input.gaDays !== undefined) {
    const gaWeeks = input.gaWeeks === undefined ? sample.gaWeeks : input.gaWeeks
    const gaDays = input.gaDays === undefined ? sample.gaDays : input.gaDays
    if (!isGestationalAgeComplete(gaWeeks, gaDays)) {
      throw new HttpError(400, 'Gestational age requires both weeks and days')
    }
    const { error } = await admin
      .from('nipt_samples')
      .update({
        ga_weeks: gaWeeks,
        ga_days: gaDays,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sampleId)
    fail(error)
    await writeAudit(actor, 'sample.ga.update', 'sample', sampleId, { gaWeeks, gaDays })
  }

  let activeRunId = sample.runId
  if (input.runType && input.runType !== sample.runType) {
    const currentIndex = RUN_TYPES.indexOf(sample.runType)
    const nextIndex = RUN_TYPES.indexOf(input.runType)
    if (nextIndex <= currentIndex) throw new HttpError(400, 'Run type must move forward to a new rerun type')
    const { data: existing } = await admin
      .from('nipt_sample_runs')
      .select('id')
      .eq('sample_id', sampleId)
      .eq('run_type', input.runType)
      .maybeSingle()
    if (existing) throw new HttpError(409, 'This rerun type was already created for the sample')
    const { error: deactivateError } = await admin.from('nipt_sample_runs').update({ is_active: false }).eq('id', sample.runId)
    fail(deactivateError)
    const { data: run, error: runError } = await admin
      .from('nipt_sample_runs')
      .insert({ sample_id: sampleId, run_type: input.runType, stage: input.stage ?? 'Received', created_by: actor.id })
      .select('id')
      .single()
    fail(runError)
    activeRunId = run!.id
    await writeAudit(actor, 'sample.rerun.create', 'sample', sampleId, { from: sample.runType, to: input.runType })
  }

  if (input.pregnancyType && input.pregnancyType !== sample.pregnancyType) {
    const { error } = await admin
      .from('nipt_samples')
      .update({ pregnancy_type: input.pregnancyType, updated_at: new Date().toISOString() })
      .eq('id', sampleId)
    fail(error)
    await writeAudit(actor, 'sample.pregnancy_type.update', 'sample', sampleId, { from: sample.pregnancyType, to: input.pregnancyType })
  }

  if (input.stage && !(input.runType && input.runType !== sample.runType)) {
    const fromIndex = STAGES.indexOf(sample.stage)
    const toIndex = STAGES.indexOf(input.stage)
    if (toIndex < fromIndex && actor.role !== 'Admin') throw new HttpError(403, 'Only Admin can move a stage backward')
    const { error } = await admin
      .from('nipt_sample_runs')
      .update({ stage: input.stage, updated_at: new Date().toISOString() })
      .eq('id', activeRunId)
    fail(error)
    await writeAudit(actor, 'sample.stage.update', 'sample', sampleId, { from: sample.stage, to: input.stage })
  }
  return getSample(sampleId)
}

export async function deleteSample(sampleId: string, actor: Actor) {
  if (actor.role !== 'Admin') throw new HttpError(403, 'Admin permission required')
  const admin = getAdminClient()
  const sample = await getSample(sampleId)
  const { data: runData, error: runError } = await admin.from('nipt_sample_runs').select('id').eq('sample_id', sampleId)
  fail(runError)
  const runIds = (runData ?? []).map((run) => run.id)
  const batchSlotQuery = runIds.length
    ? admin.from('nipt_batch_slots').select('id', { count: 'exact', head: true }).in('sample_run_id', runIds)
    : Promise.resolve({ count: 0, error: null })
  const [
    { count: batchSlotCount, error: batchSlotError },
    { count: resultCount, error: resultError },
    { count: storageSlotCount, error: storageSlotError },
  ] = await Promise.all([
    batchSlotQuery,
    admin.from('nipt_result_revisions').select('id', { count: 'exact', head: true }).eq('sample_id', sampleId),
    admin.from('nipt_storage_slots').select('id', { count: 'exact', head: true }).eq('sample_id', sampleId),
  ])
  fail(batchSlotError)
  fail(resultError)
  fail(storageSlotError)
  if (batchSlotCount) throw new HttpError(409, 'ลบไม่ได้: ตัวอย่างถูกจัดลง Task List แล้ว')
  if (resultCount) throw new HttpError(409, 'ลบไม่ได้: ตัวอย่างมี Result PDF แล้ว')
  if (storageSlotCount) throw new HttpError(409, 'ลบไม่ได้: ตัวอย่างถูกจัดเก็บแล้ว')

  // Keep nipt_daily_sequences untouched so a deleted LN Halos value stays retired.
  const { error } = await admin.from('nipt_samples').delete().eq('id', sampleId)
  fail(error)
  await writeAudit(actor, 'sample.delete', 'sample', sampleId, { ln: sample.ln, lnHalos: sample.lnHalos })
  return { id: sampleId, ln: sample.ln, lnHalos: sample.lnHalos }
}

async function mapBatch(batch: RecordRow): Promise<BatchDetail> {
  const admin = getAdminClient()
  const batchId = asString(batch.id)
  const [{ data: sheetData, error: sheetError }, { data: slotData, error: slotError }] = await Promise.all([
    admin.from('nipt_task_sheets').select('*').eq('batch_id', batchId).order('sheet_number'),
    admin.from('nipt_batch_slots').select('*').eq('batch_id', batchId).order('slot_number'),
  ])
  fail(sheetError)
  fail(slotError)
  const sheets = (sheetData ?? []) as RecordRow[]
  const slots = (slotData ?? []) as RecordRow[]
  const finalizedMap = await getNameMap(ids(sheets, 'finalized_by'))
  const runIds = ids(slots, 'sample_run_id')
  let sampleMap = new Map<string, SampleRow>()
  if (runIds.length) {
    const { data: runData, error: runError } = await admin.from('nipt_sample_runs').select('id,sample_id').in('id', runIds)
    fail(runError)
    const runRows = (runData ?? []) as RecordRow[]
    const allSamples = await listSamples({ limit: 1000 })
    const bySampleId = new Map(allSamples.map((sample) => [sample.id, sample]))
    sampleMap = new Map(
      runRows.flatMap((run): [string, SampleRow][] => {
        const sample = bySampleId.get(asString(run.sample_id))
        return sample ? [[asString(run.id), sample]] : []
      }),
    )
  }

  return {
    id: batchId,
    runNumber: Number(batch.run_number),
    runYear: Number(batch.run_year),
    runLabel: asString(batch.run_label),
    status: asString(batch.status) as BatchDetail['status'],
    createdAt: asString(batch.created_at),
    sheets: sheets.map((sheet): TaskSheet => ({
      id: asString(sheet.id),
      sheetNumber: Number(sheet.sheet_number),
      workDate: nullableString(sheet.work_date),
      operatorText: nullableString(sheet.operator_text),
      extractionLot: nullableString(sheet.extraction_lot),
      extractionExpiry: nullableString(sheet.extraction_expiry),
      libraryLot: nullableString(sheet.library_lot),
      libraryExpiry: nullableString(sheet.library_expiry),
      finalizedAt: nullableString(sheet.finalized_at),
      finalizedByName: finalizedMap.get(asString(sheet.finalized_by)) ?? null,
      revisionNumber: Number(sheet.revision_number),
    })),
    slots: slots.map((slot): BatchSlot => ({
      id: asString(slot.id),
      slotNumber: Number(slot.slot_number),
      platePosition: asString(slot.plate_position),
      sheetNumber: Number(slot.sheet_number),
      controlType: nullableString(slot.control_type) as BatchSlot['controlType'],
      sampleRunId: nullableString(slot.sample_run_id),
      sample: sampleMap.get(asString(slot.sample_run_id)) ?? null,
    })),
  }
}

export async function getCurrentBatch() {
  const { data, error } = await getAdminClient().from('nipt_batches').select('*').eq('status', 'assembling').maybeSingle()
  fail(error)
  return data ? mapBatch(data as RecordRow) : null
}

export async function getBatch(batchId: string) {
  const { data, error } = await getAdminClient().from('nipt_batches').select('*').eq('id', batchId).maybeSingle()
  fail(error)
  if (!data) throw new HttpError(404, 'Batch not found')
  return mapBatch(data as RecordRow)
}

export async function createBatch(actor: Actor) {
  const { data, error } = await getAdminClient().rpc('create_nipt_batch', { p_actor: actor.id })
  fail(error)
  return getBatch(data as string)
}

function nextSheetNumber(batch: BatchDetail) {
  const next = batch.sheets.find((sheet) => {
    if (sheet.finalizedAt) return false
    const slots = batch.slots.filter((slot) => slot.sheetNumber === sheet.sheetNumber)
    return slots.some((slot) => !slot.controlType && !slot.sampleRunId)
  })
  if (!next) throw new HttpError(409, 'All Task Lists are full or finalized')
  return next.sheetNumber
}

export async function autofillBatch(batchId: string, actor: Actor) {
  const batch = await getBatch(batchId)
  const sheet = nextSheetNumber(batch)
  const { data, error } = await getAdminClient().rpc('autofill_nipt_sheet', { p_batch: batchId, p_sheet: sheet, p_actor: actor.id })
  fail(error)
  await writeAudit(actor, 'task-sheet.autofill', 'batch', batchId, { sheet, assigned: data })
  return { sheet, assigned: Number(data), batch: await getBatch(batchId) }
}

export async function urgentFill(batchId: string, runId: string, actor: Actor) {
  const batch = await getBatch(batchId)
  const sheet = nextSheetNumber(batch)
  const { data, error } = await getAdminClient().rpc('assign_nipt_urgent', {
    p_batch: batchId,
    p_sheet: sheet,
    p_run: runId,
    p_actor: actor.id,
  })
  fail(error)
  await writeAudit(actor, 'task-sheet.urgent-fill', 'batch', batchId, { sheet, runId, slot: data })
  return { sheet, slot: Number(data), batch: await getBatch(batchId) }
}

export async function updateSheet(
  batchId: string,
  sheetNumber: number,
  input: Partial<Omit<TaskSheet, 'id' | 'sheetNumber' | 'finalizedAt' | 'finalizedByName' | 'revisionNumber'>>,
  actor: Actor,
) {
  const batch = await getBatch(batchId)
  const sheet = batch.sheets.find((row) => row.sheetNumber === sheetNumber)
  if (!sheet) throw new HttpError(404, 'Task List not found')
  if (sheet.finalizedAt) throw new HttpError(409, 'Task List is finalized')
  const { error } = await getAdminClient()
    .from('nipt_task_sheets')
    .update({
      work_date: input.workDate,
      operator_text: input.operatorText,
      extraction_lot: input.extractionLot,
      extraction_expiry: input.extractionExpiry,
      library_lot: input.libraryLot,
      library_expiry: input.libraryExpiry,
      updated_at: new Date().toISOString(),
    })
    .eq('batch_id', batchId)
    .eq('sheet_number', sheetNumber)
  fail(error)
  await writeAudit(actor, 'task-sheet.metadata.update', 'batch', batchId, { sheetNumber })
  return getBatch(batchId)
}

export async function finalizeSheet(batchId: string, sheetNumber: number, actor: Actor) {
  const batch = await getBatch(batchId)
  const sheet = batch.sheets.find((row) => row.sheetNumber === sheetNumber)
  if (!sheet) throw new HttpError(404, 'Task List not found')
  if (sheet.finalizedAt) throw new HttpError(409, 'Task List is already finalized')
  if (!sheet.workDate) throw new HttpError(400, 'Work date is required before finalizing')
  const slots = batch.slots.filter((slot) => slot.sheetNumber === sheetNumber)
  if (slots.some((slot) => !slot.controlType && !slot.sampleRunId)) throw new HttpError(409, 'Fill all patient slots before finalizing')
  const now = new Date().toISOString()
  const { error } = await getAdminClient()
    .from('nipt_task_sheets')
    .update({ finalized_at: now, finalized_by: actor.id, updated_at: now })
    .eq('batch_id', batchId)
    .eq('sheet_number', sheetNumber)
  fail(error)
  await writeAudit(actor, 'task-sheet.finalize', 'batch', batchId, { sheetNumber })
  const { data: remaining, error: remainingError } = await getAdminClient()
    .from('nipt_task_sheets')
    .select('id')
    .eq('batch_id', batchId)
    .is('finalized_at', null)
  fail(remainingError)
  if (!remaining?.length) {
    const { error: batchError } = await getAdminClient()
      .from('nipt_batches')
      .update({ status: 'extract', updated_at: now })
      .eq('id', batchId)
    fail(batchError)
    await writeAudit(actor, 'batch.extract.ready', 'batch', batchId)
  }
  return getBatch(batchId)
}

export async function unlockSheet(batchId: string, sheetNumber: number, reason: string, actor: Actor) {
  if (actor.role !== 'Admin') throw new HttpError(403, 'Admin permission required')
  const batch = await getBatch(batchId)
  const sheet = batch.sheets.find((row) => row.sheetNumber === sheetNumber)
  if (!sheet?.finalizedAt) throw new HttpError(409, 'Task List is not finalized')
  const { error } = await getAdminClient()
    .from('nipt_task_sheets')
    .update({ finalized_at: null, finalized_by: null, revision_number: sheet.revisionNumber + 1, updated_at: new Date().toISOString() })
    .eq('batch_id', batchId)
    .eq('sheet_number', sheetNumber)
  fail(error)
  await writeAudit(actor, 'task-sheet.unlock', 'batch', batchId, { sheetNumber, reason, revision: sheet.revisionNumber + 1 })
  return getBatch(batchId)
}

export async function logSheetExport(batchId: string, sheetNumber: number, actor: Actor) {
  await writeAudit(actor, 'task-sheet.export', 'batch', batchId, { sheetNumber })
}

export async function updateBatchLabel(batchId: string, runLabel: string, actor: Actor) {
  if (actor.role !== 'Admin') throw new HttpError(403, 'Admin permission required')
  const { error } = await getAdminClient().from('nipt_batches').update({ run_label: runLabel, updated_at: new Date().toISOString() }).eq('id', batchId)
  fail(error)
  await writeAudit(actor, 'batch.label.update', 'batch', batchId, { runLabel })
  return getBatch(batchId)
}

export async function getDashboard(actor: Actor): Promise<DashboardData> {
  const samples = await listSamples({ limit: 250 })
  const { data: assigned, error } = await getAdminClient().from('nipt_batch_slots').select('sample_run_id').not('sample_run_id', 'is', null)
  fail(error)
  const assignedIds = new Set((assigned ?? []).map((row) => row.sample_run_id))
  const counts = Object.fromEntries(STAGES.map((stage) => [stage, samples.filter((sample) => sample.stage === stage).length])) as Record<SampleStage, number>
  return {
    actor,
    counts,
    totalSamples: samples.length,
    gaWarningCount: samples.filter((sample) => sample.gaWeeks !== null && sample.gaWeeks >= 22).length,
    queueCount: samples.filter((sample) => !assignedIds.has(sample.runId)).length,
    recentSamples: samples.slice(0, 8),
    activeBatch: await getCurrentBatch(),
  }
}

function validateUpload(fileName: string, fileSize: number) {
  if (fileSize < 1 || fileSize > 50 * 1024 * 1024) throw new HttpError(400, 'File must be between 1 byte and 50 MB')
  return safeFileName(fileName)
}

export async function prepareHisUpload(fileName: string, fileSize: number, mimeType: string, actor: Actor) {
  const safeName = validateUpload(fileName, fileSize)
  if (!/\.(txt|csv|xls|xlsx)$/i.test(safeName)) throw new HttpError(400, 'HIS upload supports .txt, .csv, .xls, or .xlsx')
  const key = `his-imports/${new Date().toISOString().slice(0, 7)}/${randomUUID()}-${safeName}`
  await writeAudit(actor, 'his-upload.prepare', 'his-import', key, { fileName, fileSize, mimeType })
  return { key, uploadUrl: createUploadUrl(key) }
}

export async function commitHisUpload(input: { key: string; fileName: string; fileSize: number; mimeType: string }, actor: Actor) {
  const safeName = validateUpload(input.fileName, input.fileSize)
  if (!/\.(txt|csv|xls|xlsx)$/i.test(safeName)) throw new HttpError(400, 'HIS upload supports .txt, .csv, .xls, or .xlsx')
  if (!input.key.startsWith('his-imports/')) throw new HttpError(400, 'Invalid HIS upload key')
  const object = await getStorageObjectInfo(input.key)
  if (object.size !== input.fileSize) throw new HttpError(400, 'Uploaded HIS file size does not match')
  const { data, error } = await getAdminClient()
    .from('nipt_his_import_batches')
    .insert({ storage_key: input.key, file_name: input.fileName, file_size: input.fileSize, mime_type: input.mimeType, uploaded_by: actor.id })
    .select('*')
    .single()
  fail(error)
  await writeAudit(actor, 'his-upload.commit', 'his-import', data!.id, { fileName: input.fileName })
  return data
}

export async function listHisImports() {
  const { data, error } = await getAdminClient().from('nipt_his_import_batches').select('*').order('uploaded_at', { ascending: false }).limit(100)
  fail(error)
  const rows = (data ?? []) as RecordRow[]
  const names = await getNameMap(ids(rows, 'uploaded_by'))
  return rows.map((row) => ({
    id: asString(row.id),
    fileName: asString(row.file_name),
    fileSize: Number(row.file_size),
    status: asString(row.status),
    uploadedAt: asString(row.uploaded_at),
    uploadedByName: names.get(asString(row.uploaded_by)) ?? null,
  }))
}

export async function prepareResultUpload(sampleId: string, fileName: string, fileSize: number, mimeType: string, actor: Actor) {
  const safeName = validateUpload(fileName, fileSize)
  if (mimeType !== 'application/pdf' || !safeName.toLowerCase().endsWith('.pdf')) throw new HttpError(400, 'Result upload accepts PDF only')
  const sample = await getSample(sampleId)
  const revisions = await listResultRevisions(sampleId)
  if (revisions.some((revision) => revision.isActive) && actor.role !== 'Admin') throw new HttpError(403, 'Only Admin can upload a result revision')
  const revisionNumber = Math.max(0, ...revisions.map((revision) => revision.revisionNumber)) + 1
  const key = `results/${sample.lnHalos}/rev-${revisionNumber}-${randomUUID()}-${safeName}`
  await writeAudit(actor, 'result.prepare', 'sample', sampleId, { revisionNumber, fileName })
  return { key, revisionNumber, uploadUrl: createUploadUrl(key) }
}

export async function commitResultUpload(
  sampleId: string,
  input: { key: string; revisionNumber: number; fileName: string; fileSize: number },
  actor: Actor,
) {
  const safeName = validateUpload(input.fileName, input.fileSize)
  if (!safeName.toLowerCase().endsWith('.pdf')) throw new HttpError(400, 'Result upload accepts PDF only')
  const admin = getAdminClient()
  const sample = await getSample(sampleId)
  const revisions = await listResultRevisions(sampleId)
  const active = revisions.find((revision) => revision.isActive)
  if (active && actor.role !== 'Admin') throw new HttpError(403, 'Only Admin can upload a result revision')
  const expectedRevision = Math.max(0, ...revisions.map((revision) => revision.revisionNumber)) + 1
  if (input.revisionNumber !== expectedRevision || !input.key.startsWith(`results/${sample.lnHalos}/rev-${expectedRevision}-`)) {
    throw new HttpError(400, 'Invalid result revision upload key')
  }
  const object = await readStorageObject(input.key)
  if (object.byteLength !== input.fileSize) throw new HttpError(400, 'Uploaded result file size does not match')
  if (object.subarray(0, 5).toString('ascii') !== '%PDF-') throw new HttpError(400, 'Uploaded result file is not a valid PDF')
  if (active) {
    const { error } = await admin.from('nipt_result_revisions').update({ is_active: false }).eq('id', active.id)
    fail(error)
  }
  const { data, error } = await admin
    .from('nipt_result_revisions')
    .insert({
      sample_id: sampleId,
      revision_number: input.revisionNumber,
      file_name: input.fileName,
      file_size: input.fileSize,
      storage_key: input.key,
      uploaded_by: actor.id,
    })
    .select('id')
    .single()
  fail(error)
  await writeAudit(actor, 'result.commit', 'sample', sampleId, { revisionNumber: input.revisionNumber, fileName: input.fileName })
  return { id: data!.id }
}

export async function listResultRevisions(sampleId: string) {
  const { data, error } = await getAdminClient()
    .from('nipt_result_revisions')
    .select('id,revision_number,file_name,file_size,storage_key,uploaded_at,uploaded_by,is_active,voided_at,void_reason')
    .eq('sample_id', sampleId)
    .order('revision_number', { ascending: false })
  fail(error)
  const rows = (data ?? []) as RecordRow[]
  const names = await getNameMap(ids(rows, 'uploaded_by'))
  return rows.map((row) => ({
    id: asString(row.id),
    revisionNumber: Number(row.revision_number),
    fileName: asString(row.file_name),
    fileSize: Number(row.file_size),
    storageKey: asString(row.storage_key),
    uploadedAt: asString(row.uploaded_at),
    uploadedByName: names.get(asString(row.uploaded_by)) ?? null,
    isActive: Boolean(row.is_active),
    voidedAt: nullableString(row.voided_at),
    voidReason: nullableString(row.void_reason),
  }))
}

export async function getResultDownload(revisionId: string) {
  const { data, error } = await getAdminClient().from('nipt_result_revisions').select('id').eq('id', revisionId).maybeSingle()
  fail(error)
  if (!data) throw new HttpError(404, 'Result revision not found')
  return createDownloadUrl(revisionId)
}

export async function getResultFile(revisionId: string) {
  const { data, error } = await getAdminClient().from('nipt_result_revisions').select('storage_key,file_name').eq('id', revisionId).maybeSingle()
  fail(error)
  if (!data) throw new HttpError(404, 'Result revision not found')
  return { bytes: await readStorageObject(data.storage_key), fileName: data.file_name }
}

export async function voidResultRevision(revisionId: string, reason: string, actor: Actor) {
  if (actor.role !== 'Admin') throw new HttpError(403, 'Admin permission required')
  const now = new Date().toISOString()
  const { data, error } = await getAdminClient()
    .from('nipt_result_revisions')
    .update({ is_active: false, voided_at: now, voided_by: actor.id, void_reason: reason })
    .eq('id', revisionId)
    .select('sample_id')
    .single()
  fail(error)
  await writeAudit(actor, 'result.void', 'sample', data!.sample_id, { revisionId, reason })
}

export async function listUsers() {
  const { data, error } = await getAdminClient().from('nipt_users').select('*').order('display_name')
  fail(error)
  return data ?? []
}

export async function createUser(input: { ephisId: string; displayName: string; role: UserRole; password: string }, actor: Actor) {
  if (actor.role !== 'Admin') throw new HttpError(403, 'Admin permission required')
  const admin = getAdminClient()
  const { data, error } = await admin.auth.admin.createUser({
    email: `${input.ephisId}@nipt.cbh.go.th`,
    password: input.password,
    email_confirm: true,
  })
  fail(error)
  const userId = data.user!.id
  const { error: profileError } = await admin.from('nipt_users').insert({
    id: userId,
    ephis_id: input.ephisId,
    display_name: input.displayName,
    role: input.role,
  })
  if (profileError) {
    await admin.auth.admin.deleteUser(userId)
    fail(profileError)
  }
  await writeAudit(actor, 'user.create', 'user', userId, { ephisId: input.ephisId, role: input.role })
  return userId
}

export async function updateUser(userId: string, input: { displayName?: string; role?: UserRole; isActive?: boolean }, actor: Actor) {
  if (actor.role !== 'Admin') throw new HttpError(403, 'Admin permission required')
  if (userId === actor.id && input.isActive === false) throw new HttpError(400, 'You cannot deactivate your own account')
  const { error } = await getAdminClient()
    .from('nipt_users')
    .update({ display_name: input.displayName, role: input.role, is_active: input.isActive, updated_at: new Date().toISOString() })
    .eq('id', userId)
  fail(error)
  await writeAudit(actor, 'user.update', 'user', userId, input)
}

export async function resetUserPassword(userId: string, password: string, actor: Actor) {
  if (actor.role !== 'Admin') throw new HttpError(403, 'Admin permission required')
  const { error } = await getAdminClient().auth.admin.updateUserById(userId, { password })
  fail(error)
  await writeAudit(actor, 'user.password.reset', 'user', userId)
}

export async function listAuditLogs() {
  const { data, error } = await getAdminClient().from('nipt_audit_logs').select('*').order('created_at', { ascending: false }).limit(100)
  fail(error)
  const rows = (data ?? []) as RecordRow[]
  const names = await getNameMap(ids(rows, 'actor_id'))
  return rows.map((row) => ({
    id: Number(row.id),
    actorName: names.get(asString(row.actor_id)) ?? 'System',
    action: asString(row.action),
    entity_type: asString(row.entity_type),
    entity_id: nullableString(row.entity_id),
    detail: row.detail,
    created_at: asString(row.created_at),
  }))
}

export async function getSampleStorage(): Promise<SampleStorageData> {
  const admin = getAdminClient()
  const [
    { data: boxData, error: boxError },
    { data: slotData, error: slotError },
    { count: sampleCount, error: sampleCountError },
    { count: storedCount, error: storedCountError },
  ] = await Promise.all([
    admin.from('nipt_storage_boxes').select('*').order('box_year', { ascending: false }).order('box_number', { ascending: false }),
    admin.from('nipt_storage_slots').select('*').order('slot_number'),
    admin.from('nipt_samples').select('*', { count: 'exact', head: true }),
    admin.from('nipt_storage_slots').select('*', { count: 'exact', head: true }).not('sample_id', 'is', null),
  ])
  fail(boxError)
  fail(slotError)
  fail(sampleCountError)
  fail(storedCountError)

  const boxRows = (boxData ?? []) as RecordRow[]
  const slotRows = (slotData ?? []) as RecordRow[]
  const sampleIds = ids(slotRows, 'sample_id')
  const [{ data: sampleData, error: sampleError }, recordedByNames, checkoutNames] = await Promise.all([
    sampleIds.length
      ? admin.from('nipt_samples').select('id,ln,ln_halos,patient_name,imported_at,pregnancy_type').in('id', sampleIds)
      : Promise.resolve({ data: [] as RecordRow[], error: null }),
    getNameMap(ids(boxRows, 'destroyed_recorded_by')),
    getNameMap(ids(slotRows, 'checked_out_by')),
  ])
  fail(sampleError)

  const sampleMap = new Map(((sampleData ?? []) as RecordRow[]).map((sample) => [asString(sample.id), {
    id: asString(sample.id),
    ln: asString(sample.ln),
    lnHalos: asString(sample.ln_halos),
    patientName: nullableString(sample.patient_name),
    importedAt: asString(sample.imported_at),
    pregnancyType: asString(sample.pregnancy_type) || 'Single',
  }]))
  const slotsByBox = new Map<string, RecordRow[]>()
  slotRows.forEach((slot) => {
    const boxId = asString(slot.box_id)
    const rows = slotsByBox.get(boxId) ?? []
    rows.push(slot)
    slotsByBox.set(boxId, rows)
  })

  const boxes = boxRows.map((box): StorageBox => ({
    id: asString(box.id),
    boxNumber: Number(box.box_number),
    boxYear: Number(box.box_year),
    boxLabel: asString(box.box_label),
    status: asString(box.status) as StorageBox['status'],
    boxType: (asString(box.box_type) || 'buffy_coat') as StorageBoxType,
    startedAt: asString(box.started_at),
    filledAt: nullableString(box.filled_at),
    destroyDueDate: nullableString(box.destroy_due_date),
    destroyedAt: nullableString(box.destroyed_at),
    destroyedByName: nullableString(box.destroyed_by_name),
    destroyedRecordedByName: recordedByNames.get(asString(box.destroyed_recorded_by)) ?? null,
    slots: (slotsByBox.get(asString(box.id)) ?? []).map((slot) => ({
      id: asString(slot.id),
      slotNumber: Number(slot.slot_number),
      position: asString(slot.position),
      storedAt: nullableString(slot.stored_at),
      sample: sampleMap.get(asString(slot.sample_id)) ?? null,
      checkedOutAt: nullableString(slot.checked_out_at),
      checkedOutByName: checkoutNames.get(asString(slot.checked_out_by)) ?? null,
      checkoutReason: nullableString(slot.checkout_reason),
    })),
  }))

  const sampleBoxTypes = new Map<string, Set<string>>()
  for (const box of boxes) {
    for (const slot of box.slots) {
      if (slot.sample) {
        const s = sampleBoxTypes.get(slot.sample.id) ?? new Set()
        s.add(box.boxType)
        sampleBoxTypes.set(slot.sample.id, s)
      }
    }
  }
  const fullyStoredCount = [...sampleBoxTypes.values()].filter((v) => v.size === 2).length

  const today = formatBangkokIsoDate()
  const dueState = (box: StorageBox) => getStorageDueState(box.destroyDueDate, today).state
  return {
    boxes,
    queueCount: Math.max(0, (sampleCount ?? 0) - fullyStoredCount),
    storedCount: storedCount ?? 0,
    fullBoxCount: boxes.filter((box) => box.status === 'full').length,
    dueBoxCount: boxes.filter((box) => box.status === 'full' && ['due', 'overdue'].includes(dueState(box))).length,
    dueSoonBoxCount: boxes.filter((box) => box.status === 'full' && dueState(box) === 'due-soon').length,
  }
}

export async function deleteStorageBox(boxId: string, actor: Actor) {
  if (actor.role !== 'Admin') throw new HttpError(403, 'Admin permission required')
  const admin = getAdminClient()
  const { data: box, error: labelError } = await admin
    .from('nipt_storage_boxes').select('box_label').eq('id', boxId).maybeSingle()
  fail(labelError)
  if (!box) throw new HttpError(404, 'Storage box not found')
  // Slots deleted automatically via ON DELETE CASCADE
  const { error } = await admin.from('nipt_storage_boxes').delete().eq('id', boxId)
  fail(error)
  await writeAudit(actor, 'storage.box.delete', 'storage-box', boxId, { boxLabel: box.box_label })
  return getSampleStorage()
}

export async function moveStorageSlot(sourceSlotId: string, targetSlotId: string, actor: Actor) {
  if (sourceSlotId === targetSlotId) throw new HttpError(400, 'Source and target are the same slot')
  const admin = getAdminClient()
  const { data: slotData, error: slotError } = await admin
    .from('nipt_storage_slots')
    .select('id,box_id,position,sample_id,stored_at,stored_by,checked_out_at')
    .in('id', [sourceSlotId, targetSlotId])
  fail(slotError)
  const slots = (slotData ?? []) as RecordRow[]
  const source = slots.find((s) => asString(s.id) === sourceSlotId)
  const target = slots.find((s) => asString(s.id) === targetSlotId)
  if (!source || !target) throw new HttpError(404, 'Slot not found')
  if (asString(source.box_id) !== asString(target.box_id)) throw new HttpError(400, 'Slots must be in the same box')
  if (!source.sample_id) throw new HttpError(400, 'Source slot is empty')
  if (source.checked_out_at) throw new HttpError(400, 'Cannot move a checked-out sample')
  if (target.checked_out_at) throw new HttpError(400, 'Cannot swap with a checked-out slot')

  // Sequential swap to avoid any transient duplicate key issues:
  // Step 1: clear source, Step 2: fill target, Step 3: fill source with target's old data
  const { error: e1 } = await admin
    .from('nipt_storage_slots')
    .update({ sample_id: null, stored_at: null, stored_by: null })
    .eq('id', sourceSlotId)
  fail(e1)
  const { error: e2 } = await admin
    .from('nipt_storage_slots')
    .update({ sample_id: source.sample_id, stored_at: source.stored_at, stored_by: source.stored_by })
    .eq('id', targetSlotId)
  fail(e2)
  if (target.sample_id) {
    const { error: e3 } = await admin
      .from('nipt_storage_slots')
      .update({ sample_id: target.sample_id, stored_at: target.stored_at, stored_by: target.stored_by })
      .eq('id', sourceSlotId)
    fail(e3)
  }
  await writeAudit(actor, 'sample.storage.move', 'storage-slot', sourceSlotId, {
    from: asString(source.position),
    to: asString(target.position),
    swap: Boolean(target.sample_id),
  })
  return getSampleStorage()
}

export async function checkOutStorageSlot(slotId: string, reason: string, actor: Actor) {
  const admin = getAdminClient()
  const { data: slot, error: slotError } = await admin
    .from('nipt_storage_slots')
    .select('id,sample_id,checked_out_at')
    .eq('id', slotId)
    .maybeSingle()
  fail(slotError)
  if (!slot) throw new HttpError(404, 'Storage slot not found')
  if (!slot.sample_id) throw new HttpError(400, 'Slot has no sample to check out')
  if (slot.checked_out_at) throw new HttpError(409, 'Sample is already checked out from this slot')
  const now = new Date().toISOString()
  const { error } = await admin
    .from('nipt_storage_slots')
    .update({ checked_out_at: now, checked_out_by: actor.id, checkout_reason: reason.trim() })
    .eq('id', slotId)
  fail(error)
  await writeAudit(actor, 'sample.checkout', 'storage-slot', slotId, { reason: reason.trim() })
  return getSampleStorage()
}

export async function getSampleStorageBox(boxId: string) {
  const storage = await getSampleStorage()
  const box = storage.boxes.find((item) => item.id === boxId)
  if (!box) throw new HttpError(404, 'Sample Storage box not found')
  return box
}

export async function logSampleStorageExport(boxId: string, actor: Actor) {
  await writeAudit(actor, 'storage.box.export', 'storage-box', boxId)
}

export async function autofillSampleStorage(actor: Actor) {
  const { data, error } = await getAdminClient().rpc('autofill_nipt_storage', { p_actor: actor.id })
  fail(error)
  const detail = data as { assigned: number; boxes_created: number }
  await writeAudit(actor, 'storage.autofill', 'sample-storage', undefined, detail)
  return { detail, storage: await getSampleStorage() }
}

export async function destroySampleStorageBox(boxId: string, destroyedByName: string, actor: Actor) {
  const { error } = await getAdminClient().rpc('destroy_nipt_storage_box', {
    p_box: boxId,
    p_destroyed_by_name: destroyedByName.trim(),
    p_actor: actor.id,
  })
  fail(error)
  await writeAudit(actor, 'storage.box.destroy', 'storage-box', boxId, { destroyedByName: destroyedByName.trim() })
  return getSampleStorage()
}

function isQcBatchReady(batch: BatchDetail) {
  return batch.sheets.some((sheet) => Boolean(sheet.finalizedAt))
}

async function mapQcSheet(row: RecordRow, importRows: RecordRow[] = [], uploadedByNames = new Map<string, string>()): Promise<QcSheet> {
  const admin = getAdminClient()
  const qcSheetId = asString(row.id)
  const [{ data: measurementData, error: measurementError }, batch] = await Promise.all([
    admin.from('nipt_qc_measurements').select('*').eq('qc_sheet_id', qcSheetId).order('slot_number'),
    getBatch(asString(row.batch_id)),
  ])
  fail(measurementError)
  const sourceRows = buildTaskSheetSourceRows(batch)
  const printedSampleIds = new Map(sourceRows.map((sourceRow) => [sourceRow.sourceRow - 2, sourceRow.printedSampleId]))
  const slotMap = new Map(batch.slots.map((slot) => [slot.slotNumber, slot]))
  return {
    id: qcSheetId,
    batchId: batch.id,
    runLabel: batch.runLabel,
    ready: isQcBatchReady(batch),
    workDate: nullableString(row.work_date),
    operatorText: nullableString(row.operator_text),
    createdAt: asString(row.created_at),
    measurements: ((measurementData ?? []) as RecordRow[]).map((measurement) => {
      const slotNumber = Number(measurement.slot_number)
      return {
        id: asString(measurement.id),
        batchSlotId: asString(measurement.batch_slot_id),
        slotNumber,
        printedSampleId: printedSampleIds.get(slotNumber) ?? '',
        controlType: slotMap.get(slotNumber)?.controlType ?? null,
        concentration: nullableNumber(measurement.concentration),
        updatedAt: asString(measurement.updated_at),
      }
    }),
    imports: importRows.map((item): QcImport => ({
      id: asString(item.id),
      fileName: asString(item.file_name),
      fileSize: Number(item.file_size),
      status: asString(item.status),
      uploadedAt: asString(item.uploaded_at),
      uploadedByName: uploadedByNames.get(asString(item.uploaded_by)) ?? null,
    })),
  }
}

export async function getQcWorkspace(): Promise<QcWorkspace> {
  const admin = getAdminClient()
  const [
    { data: sheetData, error: sheetError },
    { data: importData, error: importError },
  ] = await Promise.all([
    admin.from('nipt_qc_sheets').select('*').order('created_at', { ascending: false }),
    admin.from('nipt_qc_import_batches').select('*').order('uploaded_at', { ascending: false }),
  ])
  fail(sheetError)
  fail(importError)
  const sheets = (sheetData ?? []) as RecordRow[]
  const imports = (importData ?? []) as RecordRow[]
  const uploadedByNames = await getNameMap(ids(imports, 'uploaded_by'))
  return {
    sheets: await Promise.all(sheets.map((sheet) => mapQcSheet(
      sheet,
      imports.filter((item) => asString(item.qc_sheet_id) === asString(sheet.id)),
      uploadedByNames,
    ))),
  }
}

export async function getQcSheet(qcSheetId: string) {
  const admin = getAdminClient()
  const [
    { data: sheet, error: sheetError },
    { data: importData, error: importError },
  ] = await Promise.all([
    admin.from('nipt_qc_sheets').select('*').eq('id', qcSheetId).maybeSingle(),
    admin.from('nipt_qc_import_batches').select('*').eq('qc_sheet_id', qcSheetId).order('uploaded_at', { ascending: false }),
  ])
  fail(sheetError)
  fail(importError)
  if (!sheet) throw new HttpError(404, 'QC Measurements sheet not found')
  const imports = (importData ?? []) as RecordRow[]
  return mapQcSheet(sheet as RecordRow, imports, await getNameMap(ids(imports, 'uploaded_by')))
}

function assertQcSheetReady(qcSheet: QcSheet) {
  if (!qcSheet.ready) throw new HttpError(409, 'Finalize at least one Task List before editing or exporting QC measurements')
}

export async function updateQcSheet(
  qcSheetId: string,
  input: {
    workDate?: string | null
    operatorText?: string | null
    measurements?: Array<{ slotNumber: number; concentration: number | null }>
  },
  actor: Actor,
) {
  const admin = getAdminClient()
  const sheet = await getQcSheet(qcSheetId)
  assertQcSheetReady(sheet)
  const now = new Date().toISOString()

  if (input.workDate !== undefined || input.operatorText !== undefined) {
    const updates: Record<string, string | null> = { updated_at: now }
    if (input.workDate !== undefined) updates.work_date = input.workDate
    if (input.operatorText !== undefined) updates.operator_text = input.operatorText?.trim() || null
    const { error } = await admin
      .from('nipt_qc_sheets')
      .update(updates)
      .eq('id', qcSheetId)
    fail(error)
  }

  if (input.measurements?.length) {
    const measurementMap = new Map(sheet.measurements.map((measurement) => [measurement.slotNumber, measurement]))
    const rows = input.measurements.map((measurement) => {
      const existing = measurementMap.get(measurement.slotNumber)
      if (!existing) throw new HttpError(400, `Unknown QC measurement slot ${measurement.slotNumber}`)
      return {
        id: existing.id,
        qc_sheet_id: sheet.id,
        batch_slot_id: existing.batchSlotId,
        slot_number: existing.slotNumber,
        concentration: measurement.concentration,
        updated_by: actor.id,
        updated_at: now,
      }
    })
    const { error } = await admin.from('nipt_qc_measurements').upsert(rows, { onConflict: 'id' })
    fail(error)
  }

  await writeAudit(actor, 'qc-sheet.update', 'qc-sheet', qcSheetId, { measurementCount: input.measurements?.length ?? 0 })
  return getQcSheet(qcSheetId)
}

export async function prepareQubitUpload(qcSheetId: string, fileName: string, fileSize: number, mimeType: string, actor: Actor) {
  const sheet = await getQcSheet(qcSheetId)
  assertQcSheetReady(sheet)
  const safeName = validateUpload(fileName, fileSize)
  if (!/\.(txt|csv|xls|xlsx)$/i.test(safeName)) throw new HttpError(400, 'Qubit upload supports .txt, .csv, .xls, or .xlsx')
  const key = `qubit-imports/${qcSheetId}/${randomUUID()}-${safeName}`
  await writeAudit(actor, 'qubit-upload.prepare', 'qc-sheet', qcSheetId, { fileName, fileSize, mimeType })
  return { key, uploadUrl: createUploadUrl(key) }
}

export async function commitQubitUpload(
  qcSheetId: string,
  input: { key: string; fileName: string; fileSize: number; mimeType: string },
  actor: Actor,
) {
  const sheet = await getQcSheet(qcSheetId)
  assertQcSheetReady(sheet)
  const safeName = validateUpload(input.fileName, input.fileSize)
  if (!/\.(txt|csv|xls|xlsx)$/i.test(safeName)) throw new HttpError(400, 'Qubit upload supports .txt, .csv, .xls, or .xlsx')
  if (!input.key.startsWith(`qubit-imports/${qcSheetId}/`)) throw new HttpError(400, 'Invalid Qubit upload key')
  const object = await getStorageObjectInfo(input.key)
  if (object.size !== input.fileSize) throw new HttpError(400, 'Uploaded Qubit file size does not match')
  const { data, error } = await getAdminClient()
    .from('nipt_qc_import_batches')
    .insert({
      qc_sheet_id: qcSheetId,
      storage_key: input.key,
      file_name: input.fileName,
      file_size: input.fileSize,
      mime_type: input.mimeType,
      uploaded_by: actor.id,
    })
    .select('id')
    .single()
  fail(error)
  await writeAudit(actor, 'qubit-upload.commit', 'qc-sheet', qcSheetId, { importId: data!.id, fileName: input.fileName })
  return getQcSheet(qcSheetId)
}

export async function getQcExportData(qcSheetId: string) {
  const qcSheet = await getQcSheet(qcSheetId)
  assertQcSheetReady(qcSheet)
  return { qcSheet, batch: await getBatch(qcSheet.batchId) }
}

export async function logQcSheetExport(qcSheetId: string, actor: Actor) {
  await writeAudit(actor, 'qc-sheet.export', 'qc-sheet', qcSheetId)
}
