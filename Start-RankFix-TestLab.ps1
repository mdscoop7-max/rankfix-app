$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
Write-Host 'RankFix QA - starten met een knop' -ForegroundColor Cyan
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'Node.js/npm ontbreekt.' }
if (-not (Test-Path 'node_modules')) { throw 'Voer eenmalig npm ci uit.' }
$sha = (& git rev-parse HEAD 2>$null | Out-String).Trim()
if ($sha -notmatch '^[a-f0-9]{40}$') { throw 'Git-versie niet beschikbaar.' }
$env:RF_QA_COMMIT_SHA = $sha
$port = 3002
$url = "http://127.0.0.1:$port/dashboard/testlab?catalog=fresh144"
$listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  $ok = $false
  try {
    $v = Invoke-RestMethod "http://127.0.0.1:$port/api/scan/version" -TimeoutSec 4
    $ok = $v.commitSha -eq $sha -and $v.environment -eq 'local'
  } catch {}
  if (-not $ok) {
    Write-Host "Op poort $port draait een andere of vastgelopen server (PID $($listener.OwningProcess))." -ForegroundColor Yellow
    Write-Host 'Er wordt geen tweede Next.js-server gestart en er wordt niets automatisch afgesloten.'
    $answer = Read-Host 'Wil je uitsluitend dit proces stoppen? Typ JA om te bevestigen'
    if ($answer -ne 'JA') { throw 'Afgebroken; geen processen gestopt.' }
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
    if (-not $process -or $process.CommandLine -notmatch 'rankfix-qa|next') { throw 'Proces niet herkenbaar als RankFix. Stop handmatig.' }
    Stop-Process -Id $listener.OwningProcess -Force
    Start-Sleep -Seconds 3
    $listener = $null
  } else {
    Write-Host 'Bestaande RankFix QA-server werkt.' -ForegroundColor Green
  }
}
if (-not $listener) {
  if (Test-Path '.next/dev/lock') {
    Write-Host 'Oud Next.js-lockbestand gevonden. Controleer of geen andere QA-server draait.' -ForegroundColor Yellow
    $answer = Read-Host 'Lock verwijderen als er geen RankFix-server draait? Typ JA'
    if ($answer -eq 'JA') { Remove-Item '.next/dev/lock' -Force -ErrorAction SilentlyContinue }
  }
  Write-Host 'RankFix QA starten op vaste poort 3002...'
  $command = 'set RF_QA_COMMIT_SHA='+$sha+' && npm.cmd run dev -- -p 3002 -H 127.0.0.1'
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', $command -WorkingDirectory $PSScriptRoot | Out-Null
  $ready = $false
  for ($i=0; $i -lt 45; $i++) {
    Start-Sleep -Seconds 2
    try {
      $v = Invoke-RestMethod "http://127.0.0.1:$port/api/scan/version" -TimeoutSec 3
      if ($v.commitSha -eq $sha -and $v.environment -eq 'local') { $ready = $true; break }
    } catch {}
  }
  if (-not $ready) { throw 'Server niet gereed. Bekijk het geopende CMD-venster.' }
}
if (-not (Test-Path '.env.local') -and -not $env:DATABASE_URL) {
  Write-Host 'LET OP: DATABASE_URL ontbreekt. De bestaande login en TestLab vereisen een werkende QA-database.' -ForegroundColor Yellow
}
Start-Process $url
Write-Host "TestLab geopend: $url" -ForegroundColor Green
