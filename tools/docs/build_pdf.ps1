# Convert a built .docx into .pdf with the Word that is already installed.
#
# Why Word instead of a Python PDF library: the .docx is the deliverable the
# user edits and reads, and Word is the only renderer here that produces a PDF
# *identical* to that document -- same pagination, same fonts, same headings.
# It also refreshes the TOC field while it is open, so the PDF's table of
# contents has real page numbers instead of the placeholder sentence.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/docs/build_pdf.ps1 \
#       -Docx dist\file.docx -Pdf dist\file.pdf
#
# Exits 0 on success. Any Word/COM failure exits 1 with the reason printed, so
# the caller can fall back (tools/docs/build_pdf_fallback.py prints the HTML the
# browser can render instead).

param(
    [Parameter(Mandatory = $true)][string]$Docx,
    [Parameter(Mandatory = $true)][string]$Pdf
)

$ErrorActionPreference = 'Stop'

$docxPath = (Resolve-Path -LiteralPath $Docx).Path
$pdfDir = Split-Path -Parent (Join-Path (Get-Location) $Pdf)
if (-not (Test-Path -LiteralPath $pdfDir)) { New-Item -ItemType Directory -Path $pdfDir | Out-Null }
$pdfPath = Join-Path (Get-Location) $Pdf

$word = $null
$doc = $null
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    try { $word.Options.UpdateFieldsAtPrint = $true } catch { }

    # ConfirmConversions = false, ReadOnly = false (we save the refreshed TOC back)
    $doc = $word.Documents.Open($docxPath, $false, $false)

    try { $doc.Fields.Update() | Out-Null } catch { }
    foreach ($toc in $doc.TablesOfContents) { $toc.Update() }
    $doc.Repaginate()

    # Keep the refreshed TOC in the .docx too, so the Word file the user opens
    # already shows page numbers.
    $doc.Save()

    # 17 = wdExportFormatPDF, 0 = wdExportOptimizeForPrint, 1 = wdExportAllDocument
    $doc.ExportAsFixedFormat($pdfPath, 17, $false, 0, 1, 0, 0, 0, $true, $true, 0, $true, $true, $false)

    $pages = $doc.ComputeStatistics(2)   # 2 = wdStatisticPages
    Write-Output ("pdf-ok pages=" + $pages + " -> " + $pdfPath)
    $doc.Close($false)
    $doc = $null
    $word.Quit()
    $word = $null
    exit 0
}
catch {
    Write-Output ("pdf-failed: " + $_.Exception.Message)
    if ($doc) { try { $doc.Close($false) } catch { } }
    if ($word) { try { $word.Quit() } catch { } }
    exit 1
}
finally {
    foreach ($o in @($doc, $word)) {
        if ($o) { try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($o) | Out-Null } catch { } }
    }
}
