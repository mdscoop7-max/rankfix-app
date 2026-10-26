@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\local-qa\start-testlab.ps1"
if errorlevel 1 (
  echo.
  echo TestLab kon niet worden gestart. Lees de melding hierboven.
  pause
)
endlocal
