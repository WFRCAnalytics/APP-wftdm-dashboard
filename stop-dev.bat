@echo off
rem Stops the Vite dev server started by start-dev.bat: its window, and whatever is still listening on the port.
setlocal
set PORT=5173
set STOPPED=0

rem the window start-dev.bat opened, with npx and node under it
rem (taskkill succeeds even when its filter matches nothing, so look first)
tasklist /fi "WINDOWTITLE eq WFTDM dev server*" | find /i "cmd.exe" >nul && (
  taskkill /fi "WINDOWTITLE eq WFTDM dev server*" /t /f >nul 2>&1
  set STOPPED=1
)

rem anything still listening on the port (a server started some other way)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":%PORT% .*LISTENING"') do (
  taskkill /pid %%p /t /f >nul 2>&1 && set STOPPED=1
)

if %STOPPED%==1 (
  echo Dev server stopped.
) else (
  echo No dev server was running on port %PORT%.
)
exit /b 0
