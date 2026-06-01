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
$qcSheet = $null

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
  $sourceSheet = $workbook.Worksheets.Item([string]$payload.sourceSheetName)
  foreach ($row in $payload.sourceRows) {
    Set-CellValue -Sheet $sourceSheet -Address "C$($row.sourceRow)" -Value ([string]$row.lnHalos)
    Set-CellValue -Sheet $sourceSheet -Address "D$($row.sourceRow)" -Value ([string]$row.printedSampleId)
  }

  $qcSheet = $workbook.Worksheets.Item([string]$payload.selectedSheetName)
  Set-CellValue -Sheet $qcSheet -Address 'D3' -Value ([string]$payload.metadata.workDate)
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
