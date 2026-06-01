param(
  [Parameter(Mandatory = $true)]
  [string]$TemplatePath,

  [Parameter(Mandatory = $true)]
  [string]$InputPath,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$excel = $null
$workbook = $null
$sourceSheet = $null
$taskSheet = $null

function Set-CellValue {
  param(
    [Parameter(Mandatory = $true)]
    $Sheet,

    [Parameter(Mandatory = $true)]
    [string]$Address,

    [AllowEmptyString()]
    [string]$Value
  )

  $cell = $Sheet.Range($Address)
  try {
    $cell.Value2 = $Value
  } finally {
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($cell)
  }
}

try {
  $payload = Get-Content -LiteralPath $InputPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $allowedSheets = @(
    'Ext. & Prep. Task List 1',
    'Ext. & Prep. Task List 2',
    'Ext. & Prep. Task List 3'
  )
  if ($payload.selectedSheetName -notin $allowedSheets) {
    throw 'Unsupported Task List sheet'
  }

  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $excel.AutomationSecurity = 3

  $workbook = $excel.Workbooks.Open($TemplatePath, 0, $true)
  $sourceSheet = $workbook.Worksheets.Item([string]$payload.sourceSheetName)
  foreach ($row in $payload.sourceRows) {
    Set-CellValue -Sheet $sourceSheet -Address "C$($row.sourceRow)" -Value ([string]$row.lnHalos)
    Set-CellValue -Sheet $sourceSheet -Address "D$($row.sourceRow)" -Value ([string]$row.printedSampleId)
  }

  $taskSheet = $workbook.Worksheets.Item([string]$payload.selectedSheetName)
  Set-CellValue -Sheet $taskSheet -Address 'B4' -Value ([string]$payload.metadata.workDate)
  Set-CellValue -Sheet $taskSheet -Address 'B5' -Value ([string]$payload.metadata.taskLabel)
  Set-CellValue -Sheet $taskSheet -Address 'K5' -Value ([string]$payload.metadata.operatorText)
  Set-CellValue -Sheet $taskSheet -Address 'B7' -Value ([string]$payload.metadata.s1Label)
  Set-CellValue -Sheet $taskSheet -Address 'H7' -Value ([string]$payload.metadata.s2Label)

  if ($payload.selectedSheetName -eq 'Ext. & Prep. Task List 3') {
    Set-CellValue -Sheet $taskSheet -Address 'B16' -Value ([string]$payload.metadata.plasmaHandler)
    Set-CellValue -Sheet $taskSheet -Address 'B17' -Value ([string]$payload.metadata.extractionInfo)
    Set-CellValue -Sheet $taskSheet -Address 'B18' -Value ([string]$payload.metadata.libraryInfo)
  } else {
    Set-CellValue -Sheet $taskSheet -Address 'B16' -Value ([string]$payload.metadata.extractionInfo)
    Set-CellValue -Sheet $taskSheet -Address 'B17' -Value ([string]$payload.metadata.libraryInfo)
  }

  $excel.CalculateFullRebuild()
  $taskSheet.ExportAsFixedFormat(0, $OutputPath, 0, $true, $false)
} finally {
  if ($taskSheet) {
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($taskSheet)
  }
  if ($sourceSheet) {
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($sourceSheet)
  }
  if ($workbook) {
    $workbook.Close($false)
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($workbook)
  }
  if ($excel) {
    $excel.Quit()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
