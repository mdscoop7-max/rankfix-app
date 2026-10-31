@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-RankFix-TestLab.ps1"
if errorlevel 1 (
 echo.
 echo Starten mislukt. Lees de melding hierboven.
 pause
)
