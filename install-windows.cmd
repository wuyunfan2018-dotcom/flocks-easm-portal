@echo off
rem ThreatBook EASM Portal - Windows installer for Flocks.
rem Double-click to install or upgrade, or run from a terminal:
rem   install-windows.cmd [-DryRun] [-Uninstall] [-NoRestart] [-NoKey] [-Yes]
setlocal EnableExtensions DisableDelayedExpansion
if exist "%~dp0install.py" goto run
echo [EASM] install.py was not found next to this file.
echo [EASM] Extract the WHOLE zip first, then run install-windows.cmd from the extracted folder.
if "%~1"=="" pause
exit /b 2
:run
set "EASM_PKG=%~dp0"
rem Files extracted from a downloaded zip carry Mark-of-the-Web; clear it (same as Properties - Unblock).
powershell.exe -NoProfile -Command "Get-ChildItem -LiteralPath $env:EASM_PKG -Recurse -File | Unblock-File" >nul 2>&1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-windows.ps1" %*
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" echo [EASM] Finished with exit code %RC%. If PowerShell said the script is "not digitally signed", see section 6 of INSTALL-Windows.zh-CN.md.
rem Keep the window open when started by double-click (no arguments).
if "%~1"=="" pause
exit /b %RC%
