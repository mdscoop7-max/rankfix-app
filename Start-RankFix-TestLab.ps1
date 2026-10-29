$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
Write-Host 'RankFix TestLab - automatische starter' -ForegroundColor Cyan
if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  throw 'Node.js of npm ontbreekt. Installeer Node.js voordat je TestLab start.'
}
if (-not (Test-Path 'node_modules')) { throw 'Afhankelijkheden ontbreken. Voer eenmalig npm install uit in de RankFix-map.' }
$sha = (& git rev-parse HEAD 2>$null | Out-String).Trim()
if ($sha -notmatch '^[a-fA-F0-9]{40}$') { throw 'Git-commit kon niet worden gelezen.' }
$env:RF_QA_COMMIT_SHA = $sha
$port = $null
$alreadyRunning = $false
foreach ($candidate in 3002..3010) {
  $versionUrl = "http://127.0.0.1:${candidate}/api/scan/version"
  $listener = Get-NetTCPConnection -LocalPort $candidate -State Listen -ErrorAction SilentlyContinue
  if ($listener) {
    try {
      $v = Invoke-RestMethod -Uri $versionUrl -TimeoutSec 3
      if ($v.commitSha -eq $sha -and $v.environment -eq 'local') {
        $port = $candidate
        $alreadyRunning = $true
        break
      }
    } catch {}
    continue
  }
  $port = $candidate
  break
}
if ($null -eq $port) { throw 'Poorten 3002 t/m 3010 zijn bezet. Sluit een oude RankFix-server en probeer opnieuw.' }
if (-not $alreadyRunning) {
  Write-Host "Server starten op poort $port..."
  $command = "npm.cmd run dev -- -p $port -H 127.0.0.1"
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', $command -WorkingDirectory $PSScriptRoot | Out-Null
  $ready = $false
  for ($i=0; $i -lt 45; $i++) {
    Start-Sleep -Seconds 2
    try {
      $v = Invoke-RestMethod -Uri "http://127.0.0.1:${port}/api/scan/version" -TimeoutSec 2
      if ($v.commitSha -eq $sha -and $v.environment -eq 'local') { $ready = $true; break }
    } catch {}
  }
  if (-not $ready) { throw "Server niet binnen 90 seconden gereed. Controleer het nieuwe servervenster." }
} else { Write-Host "Bestaande RankFix-server hergebruikt op poort $port." -ForegroundColor Green }
$url = "http://127.0.0.1:${port}/dashboard/testlab?catalog=fresh144"
Write-Host "TestLab openen: $url" -ForegroundColor Green
Start-Process $url
Write-Host 'Gereed. Je eerdere testresultaten blijven behouden.'
