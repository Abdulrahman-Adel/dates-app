@echo off
cd /d "%~dp0"
echo.
echo  Date Night - Dubai
echo.
if not exist node_modules\.bin\vite.cmd (
  echo  Installing dependencies for Windows...
  if exist node_modules rmdir /s /q node_modules
  call npm install
  echo.
)
echo  Starting at http://localhost:3000
echo  Press Ctrl+C to stop.
echo.
call npm run dev
