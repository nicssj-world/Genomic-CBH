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
$qcSheet = $null
$taskSheets = @{}

function Set-CellValue {
  param(
    [Parameter(Mandatory = $true)]
    $Sheet,

    [Parameter(Mandatory = $true)]
    [string]$Address,

    $Value
  )

  $cell = $Sheet.Range($Address)
  try {
    if ($null -eq $Value -or [string]$Value -eq '') {
      $cell.ClearContents()
    } else {
      $cell.Value2 = $Value
    }
  } finally {
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($cell)
  }
}

function Set-NumericCellValue {
  param(
    [Parameter(Mandatory = $true)]
    $Sheet,

    [Parameter(Mandatory = $true)]
    [string]$Address,

    $Value
  )

  $cell = $Sheet.Range($Address)
  try {
    if ($null -eq $Value) {
      $cell.ClearContents()
    } else {
      $cell.Value2 = [double]$Value
    }
  } finally {
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($cell)
  }
}

try {
  $payload = Get-Content -LiteralPath $InputPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($payload.selectedSheetName -ne 'QC measurements') {
    throw 'Unsupported QC sheet'
  }

  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $excel.AutomationSecurity = 3

  $workbook = $excel.Workbooks.Open($TemplatePath, 0, $true)

  # The QC sheet pulls each Sample ID via formula from the Task List sheets'
  # "Run" cells, so populate those cells before exporting.
  foreach ($entry in $payload.sampleCells) {
    $sheetName = [string]$entry.sheetName
    if (-not $taskSheets.ContainsKey($sheetName)) {
      $taskSheets[$sheetName] = $workbook.Worksheets.Item($sheetName)
    }
    Set-CellValue -Sheet $taskSheets[$sheetName] -Address ([string]$entry.cell) -Value ([string]$entry.value)
  }

  $qcSheet = $workbook.Worksheets.Item([string]$payload.selectedSheetName)
  # Force Text on the work-date cell so "dd/mm/yyyy" prints verbatim instead of
  # Excel reparsing it (e.g. 02/06/2026 -> "2/6/2026").
  $workDateCell = $qcSheet.Range('D3')
  try {
    $workDateCell.NumberFormat = '@'
    $workDateCell.Value2 = [string]$payload.metadata.workDate
  } finally {
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($workDateCell)
  }
  Set-CellValue -Sheet $qcSheet -Address 'G3' -Value ([string]$payload.metadata.operatorText)
  foreach ($measurement in $payload.measurements) {
    Set-NumericCellValue -Sheet $qcSheet -Address "C$($measurement.targetRow)" -Value $measurement.concentration
  }

  $excel.CalculateFullRebuild()
  $qcSheet.ExportAsFixedFormat(0, $OutputPath, 0, $true, $false)
} finally {
  if ($qcSheet) {
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($qcSheet)
  }
  foreach ($sheet in $taskSheets.Values) {
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($sheet)
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
