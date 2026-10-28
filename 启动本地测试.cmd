@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js 22.13.0 或更高版本，然后重新打开此文件。
  pause
  exit /b 1
)
if not exist node_modules\wrangler\bin\wrangler.js (
  call npm ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
node scripts\bao-local.mjs setup
if errorlevel 1 (
  pause
  exit /b 1
)
node scripts\bao-local.mjs start
pause
