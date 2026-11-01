# P5-validatie (1 nov 2026). Alleen lezen; geen fixes, geen publicatie.
# Start vanuit de rankfix-qa map, na: git pull
#   powershell -ExecutionPolicy Bypass -File scripts\testlab\Run-P5-Validation.ps1
# 1. Browserwaarneming kort tegen lang venster op 25 nieuwe websites (geen server nodig)
# 2. De echte scanroute op 5 websites (QA-server moet draaien op dezelfde commit)
param(
  [string]$NewSites = "12gobiking.nl,cutters.se,francetvinfo.fr,bahn.de,umicore.com,generali.it,verbund.com,ucm.es,correos.es,immoweb.be,akhwien.at,eir.ie,oesterreich.gv.at,accor.com,zaask.pt,halfords.com,brainwash-kappers.nl,tagesschau.de,irishrail.ie,asml.com,mapfre.es,enel.it,sorbonne-universite.fr,essers.com,vesteda.com",
  [string]$RouteSites = "nu.nl,alternate.nl,ns.nl,charite.de,uzleuven.be",
  [switch]$SkipObserve,
  [switch]$SkipRoute
)
$ErrorActionPreference = "Stop"
$root = (Get-Location).Path
if (-not (Test-Path "$root\scripts\testlab\ab-replay.mjs")) { throw "Start dit script vanuit de rankfix-qa map." }
if ((git status --porcelain --untracked-files=no) -ne $null) { throw "Lokale codewijzigingen aanwezig; niet uitgevoerd." }
$out = Join-Path $root "qa-results\p5-validation"; New-Item -ItemType Directory -Force $out | Out-Null
$loader = "file:///" + (($root -replace '\\', '/') + "/tests/scan-matrix/register.mjs")
if (-not $SkipObserve) {
  $env:RF_REAL_RENDER = "1"
  & node --experimental-strip-types --no-warnings --import $loader "$root\scripts\testlab\ab-replay.mjs" observe --root $root --sites $NewSites --subpages 1 --windows "short,long" --out "$out\observe-25.json"
  $code = $LASTEXITCODE
  Remove-Item Env:RF_REAL_RENDER -ErrorAction SilentlyContinue
  if ($code -ne 0) { throw "Browserwaarneming gestopt; zie de melding hierboven." }
}
if (-not $SkipRoute) {
  & node "$root\scripts\testlab\run-probe-route.mjs" --sites $RouteSites --out "$out\route"
  if ($LASTEXITCODE -ne 0) { throw "Scanroutecontrole gestopt; zie qa-results\p5-validation\route\run-log.txt" }
}
Write-Host "Klaar. Bestanden in $out : observe-25.md/json en route\summary.json + volledige audits"
