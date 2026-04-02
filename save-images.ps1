Add-Type -AssemblyName System.Windows.Forms

$targetDir = Join-Path $PSScriptRoot "public\images"
if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Path $targetDir | Out-Null }

$images = @(
    @{ Name = "home.jpg";        Desc = "Hero portrait (golden bokeh, pearl necklace)" },
    @{ Name = "botoks.jpg";      Desc = "Botoks card (aesthetic face + glow, headband)" },
    @{ Name = "dolgu.jpg";       Desc = "Dolgu card (lips / contour focus, miniature doctors)" },
    @{ Name = "mezoterapi.jpg";  Desc = "Mezoterapi card (clean skin, gray bg portrait)" }
)

foreach ($img in $images) {
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Title = "Select: $($img.Desc)"
    $dialog.Filter = "Image files|*.jpg;*.jpeg;*.png;*.webp;*.bmp|All files|*.*"
    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        $dest = Join-Path $targetDir $img.Name
        Copy-Item $dialog.FileName $dest -Force
        Write-Host "Saved: $($img.Name)" -ForegroundColor Green
    } else {
        Write-Host "Skipped: $($img.Name)" -ForegroundColor Yellow
    }
}

Write-Host "`nDone! Refresh localhost:3000 to see images." -ForegroundColor Cyan
