@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo  Energy Tech Crane - Import Product Master
echo  (22 categories, full hierarchy, 400+ items)
echo ============================================================
echo.
echo  This is safe to run as many times as you like -
echo  it never creates duplicates.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not on PATH.
  echo Install it from https://nodejs.org then run this again.
  pause
  exit /b 1
)

node erp-server\src\db\seed-product-master.js
if errorlevel 1 (
  echo.
  echo [ERROR] Import failed - see the message above.
  pause
  exit /b 1
)

echo.
echo  Done. Open the ERP - Materials / Categories to see them.
echo.
pause
