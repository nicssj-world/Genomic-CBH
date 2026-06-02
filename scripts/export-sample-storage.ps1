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
$sheet = $null

function Set-CellValue {
  param(
    [Parameter(Mandatory = $true)]
    $Sheet,

    [Parameter(Mandatory = $true)]
    [string]$Address,

    [AllowEmptyString()]
    [string]$Value,

    [switch]$AsText
  )

  $cell = $Sheet.Range($Address)
  try {
    if ($Value -eq '') {
      $cell.ClearContents()
    } else {
      if ($AsText) {
        $cell.NumberFormat = '@'
        $cell.ShrinkToFit = $true
      }
      $cell.Value2 = $Value
    }
  } finally {
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($cell)
  }
}

try {
  $payload = Get-Content -LiteralPath $InputPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($payload.sheetName -ne 'Sheet1') {
    throw 'Unsupported Sample Storage sheet'
  }

  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $excel.AutomationSecurity = 3

  # Open the approved form read-only and export from the in-memory workbook only.
  $workbook = $excel.Workbooks.Open($TemplatePath, 0, $true)
  $sheet = $workbook.Worksheets.Item([string]$payload.sheetName)
  $sheet.Range('C8:L17').ClearContents()
  Set-CellValue -Sheet $sheet -Address 'D3' -Value ([string]$payload.sampleType)
  Set-CellValue -Sheet $sheet -Address 'D5' -Value ([string]$payload.startedAt)
  Set-CellValue -Sheet $sheet -Address 'H5' -Value ([string]$payload.destroyDueDate)
  Set-CellValue -Sheet $sheet -Address 'L3' -Value ([string]$payload.destroyedByName)
  foreach ($cell in $payload.cells) {
    Set-CellValue -Sheet $sheet -Address ([string]$cell.address) -Value ([string]$cell.lnHalos) -AsText
  }

  $sheet.ExportAsFixedFormat(0, $OutputPath, 0, $true, $false)
} finally {
  if ($sheet) {
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
