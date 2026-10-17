@echo off
title WaddleVita offline pack
rem Makes offline.pack from your Waddle Forever install. Uses Node.js if you have it, otherwise Waddle Forever's own.
setlocal
set "HERE=%~dp0"
set "OUT=%HERE%offline-pack"
set "WFDIR=%LOCALAPPDATA%\Programs\Waddle Forever"
if not exist "%WFDIR%\media" set "WFDIR=%ProgramFiles%\Waddle Forever"
if not exist "%WFDIR%\media" (
  echo Waddle Forever was not found. Install it, start it once, then run this again.
  echo ^(Or run:  node build-pack.js --wf "C:\path\to\Waddle Forever"^)
  goto done
)
where node >nul 2>nul
if %errorlevel%==0 (
  node "%HERE%build-pack.js" --wf "%WFDIR%" --out "%OUT%"
) else (
  set ELECTRON_RUN_AS_NODE=1
  "%WFDIR%\Waddle Forever.exe" "%HERE%build-pack.js" --wf "%WFDIR%" --out "%OUT%"
)
echo.
echo When it says "done", copy %OUT%\offline.pack to the Vita:  ux0:data/WaddleVita/offline/offline.pack
:done
echo.
pause
