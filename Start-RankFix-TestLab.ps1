$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
Write-Host 'RankFix lokaal TestLab' -ForegroundColor Cyan
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'Node.js/npm ontbreekt.' }
if (-not (Test-Path 'node_modules')) { throw 'Voer eenmalig npm ci uit.' }
$sha = (& git rev-parse HEAD 2>$null | Out-String).Trim()
if ($sha -notmatch '^[a-f0-9]{40}$') { throw 'Git-versie niet beschikbaar.' }
$env:RF_QA_COMMIT_SHA = $sha
$port = 3002
$tokenDir = Join-Path $env:LOCALAPPDATA 'RankFix-QA'
New-Item -ItemType Directory -Path $tokenDir -Force | Out-Null
$tokenFile = Join-Path $tokenDir 'local-session-token.txt'
$token = ''
if (Test-Path $tokenFile) { $token = (Get-Content $tokenFile -Raw).Trim() }
if ($token -notmatch '^[a-fA-F0-9]{64}$') {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  $token = [BitConverter]::ToString($bytes).Replace('-','').ToLowerInvariant()
  Set-Content -Path $tokenFile -Value $token -NoNewline
}
$env:RF_LOCAL_QA_TOKEN = $token
$url = "http://127.0.0.1:$port/api/testlab/local-session?token=$token"
$listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  $ok = $false
  try {
    $v = Invoke-RestMethod "http://127.0.0.1:$port/api/scan/version" -TimeoutSec 4
    $ok = ($v.environment -eq 'local')
    if ($ok) {
      try {
        $probe = Invoke-RestMethod -Uri $url -Headers @{ 'x-rankfix-qa-probe' = '1' } -TimeoutSec 4
        $ok = ($probe.authorized -eq $true -and $probe.mode -eq 'local-qa')
      } catch { $ok = $false }
    }
  } catch {}
  if (-not $ok) {
    Write-Host "Op poort $port draait een andere of vastgelopen server (PID $($listener.OwningProcess))." -ForegroundColor Yellow
    $answer = Read-Host 'Wil je uitsluitend dit proces stoppen? Typ JA'
    if ($answer -ne 'JA') { throw 'Afgebroken; geen processen gestopt.' }
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
    if (-not $process -or $process.CommandLine -notmatch 'rankfix-qa|next') { throw 'Proces niet herkenbaar als RankFix.' }
    Stop-Process -Id $listener.OwningProcess -Force
    Start-Sleep -Seconds 3
    $listener = $null
  } else {
    Write-Host 'Bestaande QA-server hergebruiken.' -ForegroundColor Green
  }
}
if (-not $listener) {
  if (Test-Path '.next/dev/lock') {
    $answer = Read-Host 'Oud Next.js-lockbestand gevonden. Verwijderen? Typ JA'
    if ($answer -eq 'JA') { Remove-Item '.next/dev/lock' -Force -ErrorAction SilentlyContinue }
  }
  Write-Host 'QA-server starten op 127.0.0.1:3002...'
  $command = 'set RF_QA_COMMIT_SHA=' + $sha + ' && set RF_LOCAL_QA_TOKEN=' + $token + ' && npm.cmd run dev -- -p 3002 -H 127.0.0.1'
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', $command -WorkingDirectory $PSScriptRoot | Out-Null
  $ready = $false
  for ($i=0; $i -lt 15; $i++) {
    Start-Sleep -Seconds 2
    try {
      $v = Invoke-RestMethod "http://127.0.0.1:$port/api/scan/version" -TimeoutSec 3
      if ($v.environment -eq 'local') { $ready = $true; break }
    } catch {}
  }
  if (-not $ready) { throw 'Server reageert niet binnen 30 seconden. Bekijk het CMD-venster.' }
}
Write-Host 'Server gereed. QA-aanmelding controleren...' -ForegroundColor Cyan
try {
  $probe = Invoke-RestMethod -Uri $url -Headers @{ 'x-rankfix-qa-probe' = '1' } -TimeoutSec 15
  if ($probe.authorized -ne $true) { throw 'QA-toegang niet bevestigd' }
} catch {
  Write-Host 'Lokale QA-aanmelding werkt nog niet. Controleer of de oude server is afgesloten en de nieuwe server de token heeft geladen.' -ForegroundColor Red
  throw $_
}
Start-Process $url
Write-Host 'TestLab geopend via beveiligde lokale sessie.' -ForegroundColor Green
