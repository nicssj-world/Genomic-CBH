import type { ControlType, RunType, SampleStage } from '@/lib/nipt/rules'
import type { StockExpiryState } from '@/lib/nipt/stock-rules'

export type UserRole = 'Admin' | 'CBH-Staff'

export interface Actor {
  id: string
  ephisId: string
  displayName: string
  role: UserRole
}

export interface ResultRevision {
  id: string
  revisionNumber: number
  fileName: string
  fileSize: number
  uploadedAt: string
  uploadedByName: string | null
  isActive: boolean
  voidedAt: string | null
  voidReason: string | null
}

export interface SampleRow {
  id: string
  ln: string
  lnHalos: string
  importedAt: string
  importedByName: string | null
  gaWeeks: number | null
  gaDays: number | null
  patientName: string | null
  idPassport: string | null
  hn: string | null
  dob: string | null
  doctor: string | null
  collectionDate: string | null
  receivedDate: string | null
  runId: string
  runType: RunType
  stage: SampleStage
  runSampleId: string
  activeResult?: ResultRevision | null
}

export interface BatchSlot {
  id: string
  slotNumber: number
  platePosition: string
  sheetNumber: number
  controlType: ControlType | null
  sampleRunId: string | null
  sample: SampleRow | null
}

export interface TaskSheet {
  id: string
  sheetNumber: number
  workDate: string | null
  operatorText: string | null
  plasmaHandler: string | null
  extractionLot: string | null
  extractionExpiry: string | null
  libraryLot: string | null
  libraryExpiry: string | null
  finalizedAt: string | null
  finalizedByName: string | null
  revisionNumber: number
}

export interface BatchDetail {
  id: string
  runNumber: number
  runYear: number
  runLabel: string
  status: 'assembling' | 'extract' | 'pooling' | 'sequencing' | 'completed'
  createdAt: string
  sheets: TaskSheet[]
  slots: BatchSlot[]
}

export interface DashboardData {
  actor: Actor
  counts: Record<SampleStage, number>
  totalSamples: number
  gaWarningCount: number
  queueCount: number
  recentSamples: SampleRow[]
  activeBatch: BatchDetail | null
}

export interface StorageSlotSample {
  id: string
  ln: string
  lnHalos: string
  patientName: string | null
  importedAt: string
}

export interface StorageSlot {
  id: string
  slotNumber: number
  position: string
  storedAt: string | null
  sample: StorageSlotSample | null
}

export interface StorageBox {
  id: string
  boxNumber: number
  boxYear: number
  boxLabel: string
  status: 'filling' | 'full' | 'destroyed'
  startedAt: string
  filledAt: string | null
  destroyDueDate: string | null
  destroyedAt: string | null
  destroyedByName: string | null
  destroyedRecordedByName: string | null
  slots: StorageSlot[]
}

export interface SampleStorageData {
  boxes: StorageBox[]
  queueCount: number
  storedCount: number
  fullBoxCount: number
  dueBoxCount: number
  dueSoonBoxCount: number
}

export interface QcMeasurement {
  id: string
  batchSlotId: string
  slotNumber: number
  printedSampleId: string
  controlType: ControlType | null
  concentration: number | null
  updatedAt: string
}

export interface QcImport {
  id: string
  fileName: string
  fileSize: number
  status: string
  uploadedAt: string
  uploadedByName: string | null
}

export interface QcSheet {
  id: string
  batchId: string
  runLabel: string
  ready: boolean
  workDate: string | null
  operatorText: string | null
  createdAt: string
  measurements: QcMeasurement[]
  imports: QcImport[]
}

export interface QcWorkspace {
  sheets: QcSheet[]
}

export type StockMovementType = 'receive' | 'issue' | 'adjustment' | 'reversal'

export interface StockCategory {
  id: string
  name: string
  isActive: boolean
}

export interface StockLot {
  id: string
  itemId: string
  lotNumber: string
  expiryDate: string | null
  expiryState: StockExpiryState
  onHand: number
  usable: number
  createdAt: string
}

export interface StockItem {
  id: string
  itemCode: string
  name: string
  categoryId: string
  categoryName: string
  unit: string
  minimumStock: number
  trackLot: boolean
  trackExpiry: boolean
  isActive: boolean
  onHand: number
  usable: number
  isLowStock: boolean
  lots: StockLot[]
}

export interface StockMovement {
  id: string
  itemId: string
  itemCode: string
  itemName: string
  unit: string
  lotId: string
  lotNumber: string
  movementType: StockMovementType
  quantity: number
  supplier: string | null
  reference: string | null
  note: string | null
  overrideReason: string | null
  expiredConfirmed: boolean
  sourceMovementId: string | null
  reversedByMovementId: string | null
  createdBy: string
  createdByName: string | null
  createdAt: string
  canReverse: boolean
}

export interface StockWorkspace {
  categories: StockCategory[]
  items: StockItem[]
  movements: StockMovement[]
  activeItemCount: number
  lowStockItemCount: number
  expiringLotCount: number
  expiredLotCount: number
}
