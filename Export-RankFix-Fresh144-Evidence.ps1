# RankFix QA: export existing fresh144 evidence (read-only).
# Starts no scans and deletes nothing. Requires the local QA server (Start-RankFix-TestLab.cmd)
# and the SAME browser/profile in which the fresh144 TestLab run was done.
param([string]$Catalog = 'fresh144', [int]$TimeoutSeconds = 180)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$port = 3002
Write-Host "RankFix bewijs-export ($Catalog) - alleen-lezen" -ForegroundColor Cyan

try { $v = Invoke-RestMethod "http://127.0.0.1:$port/api/scan/version" -TimeoutSec 5 }
catch { throw 'Lokale QA-server niet bereikbaar op 127.0.0.1:3002. Start eerst Start-RankFix-TestLab.cmd, laat dat venster open en voer dit script opnieuw uit.' }
if ($v.environment -ne 'local') { throw 'Op poort 3002 draait geen lokale RankFix QA-server.' }

$downloads = $null
try { $downloads = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders' -ErrorAction Stop).'{374DE290-123F-4565-9164-39C4925E467B}' } catch {}
if (-not $downloads -or -not (Test-Path $downloads)) { $downloads = Join-Path $env:USERPROFILE 'Downloads' }
$started = Get-Date
$pattern = "rankfix-$Catalog-evidence-*.json"

Start-Process "http://127.0.0.1:$port/dashboard/testlab/export?catalog=$Catalog&auto=1"
Write-Host "Exportpagina geopend in je standaardbrowser. Wachten op download in $downloads ..."

$file = $null
for ($i = 0; $i -lt $TimeoutSeconds; $i += 2) {
  Start-Sleep -Seconds 2
  $file = Get-ChildItem -Path $downloads -Filter $pattern -File -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -ge $started.AddSeconds(-5) } |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($file) { Start-Sleep -Seconds 2; break }
}
if (-not $file) {
  Write-Host 'Geen exportbestand ontvangen. Kijk op de geopende pagina: staat er "Geen TestLab-resultaten", dan is de test in een andere browser of met npm run qa:144 gedaan.' -ForegroundColor Yellow
  $terminal = Join-Path $PSScriptRoot 'qa-results\fresh144-latest\fresh144.json'
  if (Test-Path $terminal) { Write-Host "Terminalresultaat gevonden (alleen samenvatting, geen volledig bewijs): $terminal" -ForegroundColor Yellow }
  exit 1
}

$target = Join-Path $PSScriptRoot 'qa-results\fresh144-latest'
New-Item -ItemType Directory -Path $target -Force | Out-Null
$copy = Join-Path $target $file.Name
Copy-Item -Path $file.FullName -Destination $copy -Force
$data = Get-Content $copy -Raw -Encoding UTF8 | ConvertFrom-Json
$run = $data.runs | Select-Object -First 1
Write-Host ''
Write-Host "Bestand: $copy" -ForegroundColor Green
Write-Host ("Grootte: {0:N1} MB | testrondes in browser: {1} | commit: {2}" -f ($file.Length/1MB), @($data.runs).Count, $run.commitSha)
Write-Host ("Sites: {0} | geslaagd: {1} | met volledig bewijs: {2}" -f $run.summary.sites, $run.summary.success, $run.summary.withEvidence)
Write-Host ('Bewijsstatus: ' + (($run.summary.evidenceState.PSObject.Properties | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join ', '))
Write-Host 'Voeg dit bestand toe in de chat met Claude.' -ForegroundColor Cyan
