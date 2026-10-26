# Windows 11: one-click RankFix TestLab launcher.
# Runs only on 127.0.0.1. No scans start automatically; no GitHub/Vercel writes.
$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
Set-Location -LiteralPath $projectRoot

$origin = "http://127.0.0.1:3001"
$testlabUrl = "$origin/dashboard/testlab?catalog=commerce"

function Get-RankFixRuntime {
  try {
    return Invoke-RestMethod -Uri "$origin/api/scan/version" -Method Get -TimeoutSec 2
  } catch {
    return $null
  }
}

try {
  if (-not (Test-Path -LiteralPath ".env.local")) {
    throw ".env.local ontbreekt. Gebruik je bestaande lokale RankFix-configuratie. Deel geen geheimen."
  }

  $sha = (& git rev-parse HEAD 2>$null)
  if ($LASTEXITCODE -ne 0 -or -not $sha -or $sha.Trim() -notmatch "^[a-f0-9]{40}$") {
    throw "Git-commit niet gevonden. Open de RankFix Git-map."
  }
  $sha = $sha.Trim()

  if (-not (Test-Path -LiteralPath "tests\fixtures\testlab-144\catalog-commerce-diverse-20261026.json")) {
    throw "De 72/72-testcatalogus ontbreekt in deze branch. Kies de juiste QA-branch."
  }

  $running = Get-RankFixRuntime
  if ($null -ne $running) {
    if ($running.commitSha -ne $sha -or $running.environment -ne "preview") {
      throw "Er draait al een andere RankFix-versie op poort 3001. Stop die server met Ctrl+C en probeer opnieuw."
    }
    Write-Host "RankFix draait al met de juiste QA-versie. TestLab openen..." -ForegroundColor Green
    Start-Process -FilePath $testlabUrl
    exit 0
  }

  # Never overwrite a different application that is already using the port.
  $listeners = @(Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue)
  if ($listeners.Count -gt 0) {
    throw "Poort 3001 is bezet, maar de juiste RankFix API reageert niet. Sluit de oude server en probeer opnieuw."
  }

  $env:VERCEL_ENV = "preview"
  $env:RF_QA_COMMIT_SHA = $sha

  if (-not (Test-Path -LiteralPath "node_modules\next\package.json")) {
    Write-Host "Node-pakketten ontbreken: eenmalig installeren..."
    $env:PUPPETEER_SKIP_DOWNLOAD = "true"
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci is mislukt. Raadpleeg de terminal." }
  }

  # Next.js production builds must match the checked-out Git commit exactly.
  # The local stamp is removed together with .next after a branch change.
  $stampPath = ".next\rankfix-testlab-commit.txt"
  $needsBuild = -not (Test-Path -LiteralPath ".next\BUILD_ID") -or -not (Test-Path -LiteralPath $stampPath)
  if (-not $needsBuild) {
    $stamp = (Get-Content -LiteralPath $stampPath -Raw).Trim()
    $needsBuild = $stamp -ne $sha
  }
  if ($needsBuild) {
    Write-Host "Eenmalige build voor commit $($sha.Substring(0,8))..."
    if (Test-Path -LiteralPath ".next") {
      Remove-Item -LiteralPath ".next" -Recurse -Force
    }
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw "RankFix-build is mislukt. Bekijk de regels hierboven." }
    Set-Content -LiteralPath $stampPath -Value $sha -Encoding Ascii
  } else {
    Write-Host "Bestaande build hoort bij deze commit: bouwen niet nodig." -ForegroundColor Green
  }

  Write-Host "RankFix lokaal starten op poort 3001..."
  Write-Host "Laat het nieuwe servervenster open terwijl je TestLab gebruikt."
  # A dedicated server window stays open after the launcher finishes.
  Start-Process -FilePath "cmd.exe" -WorkingDirectory $projectRoot -ArgumentList '/k "npm.cmd run start -- -p 3001 -H 127.0.0.1"' | Out-Null

  $ready = $false
  for ($i = 0; $i -lt 45; $i++) {
    Start-Sleep -Seconds 2
    $runtime = Get-RankFixRuntime
    if ($null -ne $runtime -and $runtime.commitSha -eq $sha -and $runtime.environment -eq "preview") {
      $ready = $true
      break
    }
  }
  if (-not $ready) {
    throw "RankFix is niet bevestigd als klaar op poort 3001. Bekijk het nieuwe servervenster voor de fout."
  }

  Write-Host "RankFix draait. TestLab openen..." -ForegroundColor Green
  Start-Process -FilePath $testlabUrl
  Write-Host "Start de scans pas na controle van je aanmelding en QA-toegang."
} catch {
  Write-Host ""
  Write-Host "START MISLUKT: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
