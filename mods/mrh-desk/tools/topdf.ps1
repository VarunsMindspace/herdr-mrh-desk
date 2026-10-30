param([Parameter(Mandatory = $true)][string]$In, [Parameter(Mandatory = $true)][string]$Out)

$ErrorActionPreference = "Stop"
$inPath = [System.IO.Path]::GetFullPath($In)
$outPath = [System.IO.Path]::GetFullPath($Out)
$outDir = [System.IO.Path]::GetDirectoryName($outPath)
if (-not (Test-Path -LiteralPath $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
$extension = [System.IO.Path]::GetExtension($inPath).ToLowerInvariant()

if ($extension -eq ".docx") {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  try {
    $doc = $word.Documents.Open($inPath, $false, $true)
    $doc.ExportAsFixedFormat($outPath, 17)
    $doc.Close(0)
  } finally {
    $word.Quit()
  }
} elseif ($extension -eq ".xlsx") {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  try {
    $book = $excel.Workbooks.Open($inPath, 0, $true)
    $book.ExportAsFixedFormat(0, $outPath)
    $book.Close($false)
  } finally {
    $excel.Quit()
  }
} else {
  throw "Unsupported file type: $extension"
}

if (-not (Test-Path -LiteralPath $outPath)) { throw "No PDF was written" }
Write-Output "pdf ok"
