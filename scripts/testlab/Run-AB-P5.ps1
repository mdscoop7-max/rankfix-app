# A/B-vergelijking scanmotor op IDENTIEKE inhoud (P5, 31 okt 2026). Alleen lezen.
# Gebruik (vanuit de rankfix-qa map, servervenster NIET nodig):
#   powershell -ExecutionPolicy Bypass -File scripts\testlab\Run-AB-P5.ps1
# 1. neemt de HTTP-antwoorden van de sites één keer op (nieuwste QA-commit, browser uit)
# 2. speelt exact die antwoorden af voor de nieuwe en de oude scanmotor
# 3. schrijft de verschillen per controle naar qa-results\ab-p5\vergelijking.md
# 4. start de browser direct per URL en vergelijkt JSON-LD in server-HTML en browser-DOM
param(
  [switch]$ObserveOnly,
  [string]$OldCommit = "f701f62d",
  [string]$Sites = "nu.nl,ns.nl,bosch.de,afas.nl,argenta.be,uzleuven.be,alternate.nl,allekoffers.nl,tcd.ie,zoofy.nl,charite.de,rossopomodoro.it"
)
$ErrorActionPreference = "Stop"
$root = (Get-Location).Path
if (-not (Test-Path "$root\scripts\testlab\ab-replay.mjs")) { throw "Start dit script vanuit de rankfix-qa map." }
if ((git status --porcelain --untracked-files=no) -ne $null) { throw "Lokale codewijzigingen aanwezig; test niet uitgevoerd." }
$out = Join-Path $root "qa-results\ab-p5"; New-Item -ItemType Directory -Force $out | Out-Null
$old = Join-Path (Split-Path $root) "rankfix-ab-old"
if (-not (Test-Path $old)) { git worktree add --detach $old $OldCommit | Out-Null }
if (-not (Test-Path "$old\node_modules")) { cmd /c mklink /J "$old\node_modules" "$root\node_modules" | Out-Null }
$tool = "$root\scripts\testlab\ab-replay.mjs"
function Invoke-Engine([string]$engineRoot, [string[]]$toolArgs) {
  $loader = "file:///" + (($engineRoot -replace '\\', '/') + "/tests/scan-matrix/register.mjs")
  & node --experimental-strip-types --no-warnings --import $loader $tool @toolArgs
  if ($LASTEXITCODE -ne 0) { throw "Gestopt; resultaten tot nu toe staan in $out" }
}
if (-not $ObserveOnly -or -not (Test-Path "$out\ab-cache.json.gz")) {
Invoke-Engine $root @("record", "--root", $root, "--cache", "$out\ab-cache.json.gz", "--out", "$out\record-new.json", "--sites", $Sites)
Invoke-Engine $root @("replay", "--root", $root, "--cache", "$out\ab-cache.json.gz", "--out", "$out\replay-new.json", "--sites", $Sites)
Invoke-Engine $old  @("replay", "--root", $old,  "--cache", "$out\ab-cache.json.gz", "--out", "$out\replay-old.json", "--sites", $Sites)
node $tool compare --a "$out\replay-old.json" --b "$out\replay-new.json" --out "$out\vergelijking.md" | Out-Null
}
# Browserwaarneming los van de scanroute: per URL server-HTML tegenover browser-DOM.
# RF_REAL_RENDER=1 houdt de echte browser in plaats van de teststub (alleen voor deze stap).
$env:RF_REAL_RENDER = "1"
& node --experimental-strip-types --no-warnings --import ("file:///" + (($root -replace '\\', '/') + "/tests/scan-matrix/register.mjs")) $tool observe --root $root --cache "$out\ab-cache.json.gz" --out "$out\observe.json" --sites $Sites
Remove-Item Env:RF_REAL_RENDER -ErrorAction SilentlyContinue
if ($LASTEXITCODE -ne 0) { throw "Browsermeting gestopt; zie de melding hierboven." }
Write-Host "Klaar. Bestanden in $out : vergelijking.md, observe.md, replay-old.json, replay-new.json, record-new.json, observe.json"
