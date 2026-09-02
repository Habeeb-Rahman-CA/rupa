# Regenerate PWA icons (multiple sizes) and favicon.ico from public/rupa-icon.png.
# Uses System.Drawing (built into Windows PowerShell 5.1).
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Join-Path $PSScriptRoot '..'
$src = Join-Path $root 'public\rupa-icon.png'
$iconsDir = Join-Path $root 'public\icons'
$faviconPath = Join-Path $root 'public\favicon.ico'

if (-not (Test-Path $src)) { throw "Source image not found: $src" }
if (-not (Test-Path $iconsDir)) { New-Item -ItemType Directory -Path $iconsDir | Out-Null }

$sourceImg = [System.Drawing.Image]::FromFile($src)

# Resize with proper aspect: source is 1024x1024 square, so 1:1 resize works.
function Resize-Png([int]$size, [string]$outPath, [bool]$whiteBg = $true) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  if ($whiteBg) { $g.Clear([System.Drawing.Color]::White) } else { $g.Clear([System.Drawing.Color]::Transparent) }
  $g.DrawImage($sourceImg, 0, 0, $size, $size)
  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Write-Output "  Wrote $outPath ($size x $size)"
}

# --- PWA icons ---------------------------------------------------------------
Write-Output "PWA icons:"
$pwaSizes = @(72, 96, 128, 144, 152, 192, 384, 512)
foreach ($s in $pwaSizes) {
  Resize-Png -size $s -outPath (Join-Path $iconsDir "icon-${s}x${s}.png") -whiteBg $true
}

# Apple touch icon (standalone, no white bg? use white — clean look on iOS)
Resize-Png -size 180 -outPath (Join-Path $root 'public\apple-touch-icon.png') -whiteBg $true

# --- favicon.ico -------------------------------------------------------------
# Build a proper multi-size ICO with 16, 32, 48 PNG frames embedded.
Write-Output "favicon.ico:"
$icoSizes = @(16, 32, 48)
$frames = @()
foreach ($s in $icoSizes) {
  $bmp = New-Object System.Drawing.Bitmap $s, $s
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::White)
  $g.DrawImage($sourceImg, 0, 0, $s, $s)
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  $frames += ,[PSCustomObject]@{ Size = $s; Bytes = $ms.ToArray() }
  $ms.Dispose()
}

# Assemble the ICO file bytes
$out = New-Object System.IO.MemoryStream
$w = New-Object System.IO.BinaryWriter($out)
# ICONDIR (6 bytes)
$w.Write([uint16]0)             # Reserved
$w.Write([uint16]1)             # Type = 1 (ICO)
$w.Write([uint16]$frames.Count) # Number of images

$headerSize = 6 + (16 * $frames.Count)
$offsets = @()
$runningOffset = $headerSize
foreach ($f in $frames) {
  $offsets += $runningOffset
  $runningOffset += $f.Bytes.Length
}

# ICONDIRENTRY entries (16 bytes each)
for ($i = 0; $i -lt $frames.Count; $i++) {
  $f = $frames[$i]
  $sizeByte = if ($f.Size -ge 256) { 0 } else { $f.Size }
  $w.Write([byte]$sizeByte)              # width
  $w.Write([byte]$sizeByte)              # height
  $w.Write([byte]0)                      # color count
  $w.Write([byte]0)                      # reserved
  $w.Write([uint16]1)                    # color planes
  $w.Write([uint16]32)                   # bits per pixel
  $w.Write([uint32]$f.Bytes.Length)      # size of image data
  $w.Write([uint32]$offsets[$i])         # offset to data
}

foreach ($f in $frames) {
  $w.Write($f.Bytes)
}

$w.Flush()
[System.IO.File]::WriteAllBytes($faviconPath, $out.ToArray())
$icoBytes = (Get-Item $faviconPath).Length
Write-Output "  Wrote $faviconPath (16, 32, 48 frames - $icoBytes bytes)"

$w.Dispose(); $out.Dispose()
$sourceImg.Dispose()

Write-Output "Done."
