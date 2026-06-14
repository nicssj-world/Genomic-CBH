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

  $taskSheet = $workbook.Worksheets.Item([string]$payload.selectedSheetName)
  # B4 carries a date number format; force Text so "dd/mm/yyyy" prints verbatim
  # instead of Excel reparsing it (e.g. 02/06/2026 -> "2/6/2026 0:00").
  $workDateCell = $taskSheet.Range('B4')
  try {
    $workDateCell.NumberFormat = '@'
    $workDateCell.Value2 = [string]$payload.metadata.workDate
  } finally {
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($workDateCell)
  }
  Set-CellValue -Sheet $taskSheet -Address 'B5' -Value ([string]$payload.metadata.taskLabel)
  Set-CellValue -Sheet $taskSheet -Address 'K5' -Value ([string]$payload.metadata.operatorText)
  Set-CellValue -Sheet $taskSheet -Address 'B8' -Value ([string]$payload.metadata.s1Label)
  Set-CellValue -Sheet $taskSheet -Address 'H8' -Value ([string]$payload.metadata.s2Label)
  Set-CellValue -Sheet $taskSheet -Address 'B17' -Value ([string]$payload.metadata.extractionInfo)
  Set-CellValue -Sheet $taskSheet -Address 'B18' -Value ([string]$payload.metadata.libraryInfo)

  foreach ($entry in $payload.sampleCells) {
    Set-CellValue -Sheet $taskSheet -Address ([string]$entry.cell) -Value ([string]$entry.value)
  }

  # Force the approved 2-page layout with page 2 starting at the "Library
  # Preparation" section (row 32). Fit-to-pages scaling ignores manual page
  # breaks, so use a fixed zoom together with an explicit horizontal break.
  $taskSheet.PageSetup.Zoom = 85
  $taskSheet.ResetAllPageBreaks()
  [void]$taskSheet.HPageBreaks.Add($taskSheet.Range('A32'))

  $excel.CalculateFullRebuild()
  $taskSheet.ExportAsFixedFormat(0, $OutputPath, 0, $true, $false)
} finally {
  if ($taskSheet) {
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($taskSheet)
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
