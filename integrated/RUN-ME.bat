@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================================
echo  Energy Tech Crane - Full Setup ^& Run
echo  Working folder: %cd%
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not on PATH.
  echo Install it from https://nodejs.org then run this script again.
  pause
  exit /b 1
)

echo [1/6] Installing erp-server dependencies...
cd erp-server
call npm install
if errorlevel 1 (
  echo [ERROR] erp-server npm install failed. See output above.
  pause
  exit /b 1
)
cd ..
echo   OK
echo.

echo [2/6] Installing erp-client dependencies...
cd erp-client
call npm install
if errorlevel 1 (
  echo [ERROR] erp-client npm install failed. See output above.
  pause
  exit /b 1
)
echo   OK
echo.

echo [3/6] Building ERP frontend...
call npm run build
if errorlevel 1 (
  echo [ERROR] Build failed. See output above.
  pause
  exit /b 1
)
if not exist dist\app.js (
  echo [ERROR] Build did not produce dist\app.js.
  pause
  exit /b 1
)
cd ..
echo   OK - dist\app.js and dist\app.css created
echo.

echo [4/6] Copying build output into public\erp ...
echo   NOTE: index.html is deliberately NOT overwritten - it already
echo   has the correct /erp/ paths for this unified server.
copy /Y erp-client\dist\app.js public\erp\app.js >nul
copy /Y erp-client\dist\app.css public\erp\app.css >nul
if errorlevel 1 (
  echo [ERROR] Copy failed.
  pause
  exit /b 1
)
echo   OK
echo.

echo [5/7] Seeding demo data (safe to re-run)...
node erp-server\src\db\seed-demo.js
echo.

echo [6/7] Importing product master (22 categories, full hierarchy)...
echo   Safe to re-run - never creates duplicates.
node erp-server\src\db\seed-product-master.js
echo.

echo [7/7] Verifying the two files that matter actually match...
fc /b erp-client\dist\app.js public\erp\app.js >nul
if errorlevel 1 (
  echo [WARNING] public\erp\app.js does NOT match the freshly built file!
  echo Something blocked the copy - check file permissions.
) else (
  echo   OK - public\erp\app.js is the freshly built version.
)
echo.

echo ============================================================
echo  Starting the server now.
echo  Leave this window open.
echo.
echo  Website : http://localhost:3000/
echo  Login   : http://localhost:3000/login
echo  ERP     : http://localhost:3000/erp/
echo.
echo  Demo logins (password for all: Demo@2026):
echo    admin@demo.energytechcrane.com
echo    sales@demo.energytechcrane.com
echo    production@demo.energytechcrane.com
echo    accounts@demo.energytechcrane.com
echo.
echo  IMPORTANT: once the page opens in your browser, press
echo  Ctrl+F5 (hard refresh) so it doesn't load an old cached copy.
echo ============================================================
echo.

node server.js
pause
