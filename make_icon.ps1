Add-Type -AssemblyName System.Drawing

$repo = "C:\Users\dadde\Documents\GitHub\fnirsi-ips3608-studio"
$pngPath = "$repo\assets\icon.png"
$icoPath = "$repo\build\icon.ico"
$assetsIcoPath = "$repo\assets\icon.ico"

# 1. Generate 256x256 High-Resolution Master Icon
$bmp = New-Object System.Drawing.Bitmap(256, 256)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

$g.Clear([System.Drawing.Color]::Transparent)

# Background: Rounded Squircle with Dark Radial / Linear Tech Gradient
$rect = New-Object System.Drawing.Rectangle(8, 8, 240, 240)
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$r = 48 # Corner radius
$d = $r * 2
$path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
$path.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
$path.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
$path.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
$path.CloseFigure()

$bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point(0, 0)),
    (New-Object System.Drawing.Point(256, 256)),
    [System.Drawing.Color]::FromArgb(18, 26, 44),
    [System.Drawing.Color]::FromArgb(6, 10, 18)
)
$g.FillPath($bgBrush, $path)
$bgBrush.Dispose()

# Glowing Border (Cyan to Deep Blue)
$borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(220, 0, 215, 255), 4)
$g.DrawPath($borderPen, $path)
$borderPen.Dispose()

# Inner Accent Ring
$innerPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$inR = 36; $inD = $inR * 2
$innerRect = New-Object System.Drawing.Rectangle(20, 20, 216, 216)
$innerPath.AddArc($innerRect.X, $innerRect.Y, $inD, $inD, 180, 90)
$innerPath.AddArc($innerRect.Right - $inD, $innerRect.Y, $inD, $inD, 270, 90)
$innerPath.AddArc($innerRect.Right - $inD, $innerRect.Bottom - $inD, $inD, $inD, 0, 90)
$innerPath.AddArc($innerRect.X, $innerRect.Bottom - $inD, $inD, $inD, 90, 90)
$innerPath.CloseFigure()

$innerPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(45, 0, 180, 255), 1.5)
$g.DrawPath($innerPen, $innerPath)
$innerPen.Dispose()
$innerPath.Dispose()
$path.Dispose()

# Central Iconography: Power Lightning Bolt + Dial Waveforms
$boltPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$boltPoints = @(
    [System.Drawing.Point]::new(142, 42),
    [System.Drawing.Point]::new(92, 126),
    [System.Drawing.Point]::new(128, 126),
    [System.Drawing.Point]::new(114, 210),
    [System.Drawing.Point]::new(174, 114),
    [System.Drawing.Point]::new(138, 114)
)
$boltPath.AddPolygon($boltPoints)

# Bolt Glow / Shadow
$glowPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(90, 0, 255, 170), 12)
$glowPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$g.DrawPath($glowPen, $boltPath)
$glowPen.Dispose()

# Bolt Fill: Gradient Cyan to Electric Green
$boltBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point(100, 40)),
    (New-Object System.Drawing.Point(160, 210)),
    [System.Drawing.Color]::FromArgb(0, 240, 255),
    [System.Drawing.Color]::FromArgb(0, 255, 140)
)
$g.FillPath($boltBrush, $boltPath)
$boltBrush.Dispose()
$boltPath.Dispose()

# Decorative Pulse Dots & Tech Text
$fontLabel = New-Object System.Drawing.Font("Segoe UI", 11, [System.Drawing.FontStyle]::Bold)
$brushLabel = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(230, 255, 255, 255))
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = [System.Drawing.StringAlignment]::Center

$g.DrawString("IPS3608", $fontLabel, $brushLabel, 128, 204, $fmt)

# Indicator Status Dots: Green (CV), Orange (CC)
$g.FillEllipse((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(0, 255, 140))), 52, 48, 10, 10)
$g.FillEllipse((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 170, 0))), 194, 48, 10, 10)

$fontLabel.Dispose()
$brushLabel.Dispose()
$fmt.Dispose()
$g.Dispose()

# Save PNG
$bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "Created $pngPath"

# 2. Build multi-size Windows .ICO file directly in pure .NET
function Convert-Bitmap-To-Ico($srcBmp, $destIcoPath) {
    $sizes = @(256, 128, 64, 48, 32, 16)
    $imagesData = @()

    foreach ($size in $sizes) {
        $resized = New-Object System.Drawing.Bitmap($size, $size)
        $rg = [System.Drawing.Graphics]::FromImage($resized)
        $rg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $rg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $rg.DrawImage($srcBmp, 0, 0, $size, $size)
        $rg.Dispose()

        $ms = New-Object System.IO.MemoryStream
        $resized.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
        $resized.Dispose()
        $imagesData += ,@($size, $ms.ToArray())
        $ms.Dispose()
    }

    $fs = [System.IO.File]::Create($destIcoPath)
    $bw = New-Object System.IO.BinaryWriter($fs)

    # ICONDIR structure (6 bytes)
    $bw.Write([uint16]0) # Reserved
    $bw.Write([uint16]1) # Type: 1 = Icon
    $bw.Write([uint16]$imagesData.Count) # Number of images

    # Compute offset after all ICONDIRENTRY structures
    $offset = 6 + ($imagesData.Count * 16)

    foreach ($item in $imagesData) {
        $sz = $item[0]
        $bytes = $item[1]
        $w = if ($sz -ge 256) { [byte]0 } else { [byte]$sz }
        $h = if ($sz -ge 256) { [byte]0 } else { [byte]$sz }

        $bw.Write($w)             # Width
        $bw.Write($h)             # Height
        $bw.Write([byte]0)        # ColorCount
        $bw.Write([byte]0)        # Reserved
        $bw.Write([uint16]1)      # Planes
        $bw.Write([uint16]32)     # BitCount
        $bw.Write([uint32]$bytes.Length) # BytesInRes
        $bw.Write([uint32]$offset)       # ImageOffset

        $offset += $bytes.Length
    }

    foreach ($item in $imagesData) {
        $bw.Write($item[1])
    }

    $bw.Flush()
    $bw.Dispose()
    $fs.Dispose()
    Write-Host "Created multi-res .ICO at $destIcoPath"
}

Convert-Bitmap-To-Ico -srcBmp $bmp -destIcoPath $icoPath
Convert-Bitmap-To-Ico -srcBmp $bmp -destIcoPath $assetsIcoPath

$bmp.Dispose()
