@echo off
rem Starts the Vite dev server in its own window (stop it with stop-dev.bat) and opens the dashboard in the browser.
setlocal
set PORT=5173
set URL=http://localhost:%PORT%/APP-wftdm-dashboard/

cd /d "%~dp0"

rem already running? just open it
netstat -ano | findstr /r /c:":%PORT% .*LISTENING" >nul
if %errorlevel%==0 (
  echo The dev server is already running on port %PORT%.
  if not defined NO_BROWSER start "" "%URL%"
  exit /b 0
)

if not exist node_modules (
  echo Installing dependencies first...
  call npm install || exit /b 1
)

rem the window title is how stop-dev.bat finds it; --strictPort fails instead of moving to another port
start "WFTDM dev server" cmd /k npx vite --port %PORT% --strictPort

rem wait (up to about 60 seconds) for the server to listen, then open the browser
for /l %%i in (1,1,60) do (
  netstat -ano | findstr /r /c:":%PORT% .*LISTENING" >nul && goto :ready
  rem a one-second wait that works even when this script's input is redirected (timeout does not)
  ping -n 2 127.0.0.1 >nul
)
echo The dev server did not start within a minute; see the "WFTDM dev server" window.
exit /b 1

:ready
echo Dev server running at %URL%
rem set NO_BROWSER=1 to skip opening the browser
if not defined NO_BROWSER start "" "%URL%"
exit /b 0
