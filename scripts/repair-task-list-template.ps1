param(
  [Parameter(Mandatory = $true)]
  [string]$TemplatePath
)

$ErrorActionPreference = 'Stop'
$excel = $null
$workbook = $null
$workingPath = Join-Path ([System.IO.Path]::GetTempPath()) "nipt-task-list-template-$([guid]::NewGuid()).xlsm"
$taskSheets = @(
  'Ext. & Prep. Task List 1',
  'Ext. & Prep. Task List 2',
  'Ext. & Prep. Task List 3'
)
$secondPageRows = @{
  'Ext. & Prep. Task List 1' = 27
  'Ext. & Prep. Task List 2' = 27
  'Ext. & Prep. Task List 3' = 28
}
$proteaseRows = @{
  'Ext. & Prep. Task List 1' = 29
  'Ext. & Prep. Task List 2' = 29
  'Ext. & Prep. Task List 3' = 30
}
$titleLine = 'NIPT DNA Extraction & Library Preparation Task List'
$subtitleLine = '(with fragment screening)'
$title = "$titleLine`n$subtitleLine"
$logoHeight = 30.0

try {
  Copy-Item -LiteralPath $TemplatePath -Destination $workingPath

  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $excel.AutomationSecurity = 3

  $workbook = $excel.Workbooks.Open($workingPath, 0, $false)
  foreach ($sheetName in $taskSheets) {
    $sheet = $workbook.Worksheets.Item($sheetName)
    $header = $sheet.Range('B1')
    $logoArea = $sheet.Range('A1:A3')
    try {
      $header.Value2 = $title
      $header.WrapText = $true
      $header.HorizontalAlignment = -4108
      $header.VerticalAlignment = -4108
      $header.Font.Name = 'Times New Roman'
      $header.Font.Size = 14
      $header.Font.Bold = $true
      $header.Font.Color = 0

      $subtitle = $header.Characters($titleLine.Length + 2, $subtitleLine.Length)
      try {
        $subtitle.Font.Name = 'Times New Roman'
        $subtitle.Font.Size = 13
        $subtitle.Font.Bold = $true
        $subtitle.Font.Color = 255
      } finally {
        [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($subtitle)
      }

      foreach ($shape in $sheet.Shapes) {
        try {
          $insideLogoArea = $shape.Type -eq 13 -and
            $shape.Top -lt ($logoArea.Top + $logoArea.Height) -and
            $shape.Left -lt ($logoArea.Left + $logoArea.Width)
          if ($insideLogoArea) {
            $shape.LockAspectRatio = -1
            $shape.Height = $logoHeight
            $shape.Left = $logoArea.Left + (($logoArea.Width - $shape.Width) / 2)
            $shape.Top = $logoArea.Top + (($logoArea.Height - $shape.Height) / 2)
          }
        } finally {
          [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($shape)
        }
      }

      $sheet.Rows.Item($proteaseRows[$sheetName]).RowHeight = 28.0

      $sheet.ResetAllPageBreaks()
      $secondPageCell = $sheet.Range("A$($secondPageRows[$sheetName])")
      try {
        $pageBreak = $sheet.HPageBreaks.Add($secondPageCell)
        [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($pageBreak)
      } finally {
        [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($secondPageCell)
      }
    } finally {
      [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($logoArea)
      [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($header)
      [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($sheet)
    }
  }

  $workbook.Save()
  $workbook.Close($false)
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($workbook)
  $workbook = $null

  Copy-Item -LiteralPath $workingPath -Destination $TemplatePath -Force
} finally {
  if ($workbook) {
    $workbook.Close($false)
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($workbook)
  }
  if ($excel) {
    $excel.Quit()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
  }
  if (Test-Path -LiteralPath $workingPath) {
    Remove-Item -LiteralPath $workingPath -Force
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
