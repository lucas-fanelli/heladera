# Ensambla docs/diseno/shoplist-diseno.html a partir de las partes de esta carpeta.
# Uso: powershell -File docs/diseno/src/build.ps1
# Las fuentes (OFL: Bricolage Grotesque, Nunito Sans, JetBrains Mono) se embeben como data URI
# porque la página tiene que ser autocontenida (sin CDNs).
$ErrorActionPreference = 'Stop'
$src = $PSScriptRoot
$out = Join-Path (Split-Path $src -Parent) 'shoplist-diseno.html'
$enc = [System.Text.UTF8Encoding]::new($false)
$read = { param($name) [IO.File]::ReadAllText((Join-Path $src $name), $enc) }
$b64  = { param($name) [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $src "fonts\$name"))) }

$tpl = & $read 'shoplist-diseno.template.html'
$p1  = & $read 'part1-intro.html'
$p2  = & $read 'part2-arch.html'
$pn  = & $read 'part-nfc.html'
$pd  = & $read 'part-deploy.html'
$pu  = & $read 'part-ux.html'
$pw  = & $read 'part-wire.html'
$pm  = & $read 'part-motion.html'
$pt  = & $read 'part-testing.html'
$pr  = & $read 'part-risks.html'

$pu = $pu.Replace('__WIRE__', $pw).Replace('__MOTION__', $pm)
$pr = $pr.Replace('__TESTING__', $pt)
$main = ($p1, $p2, $pn, $pd, $pu, $pr) -join "`n"
$html = $tpl.Replace('__MAIN__', $main)
$html = $html.Replace('__FONT_BRICOLAGE__', (& $b64 'bricolage-grotesque-latin-wght-normal.woff2'))
$html = $html.Replace('__FONT_NUNITO__',    (& $b64 'nunito-sans-latin-wght-normal.woff2'))
$html = $html.Replace('__FONT_MONO__',      (& $b64 'jetbrains-mono-latin-wght-normal.woff2'))

$left = [regex]::Matches($html, '__[A-Z_]+__') | ForEach-Object { $_.Value } | Sort-Object -Unique
if ($left) { throw "Placeholders sin reemplazar: $($left -join ', ')" }
[IO.File]::WriteAllText($out, $html, $enc)
Write-Output ("OK -> {0} ({1} bytes)" -f $out, (Get-Item $out).Length)
