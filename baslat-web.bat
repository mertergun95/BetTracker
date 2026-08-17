@echo off
REM Starts BetTracker in the browser. Double-click this, leave the window open.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js bulunamadi. https://nodejs.org adresinden kurup tekrar dene.
  pause
  exit /b 1
)

if not exist node_modules (
  echo === Bagimliliklar kuruluyor, ilk sefer birkac dakika surebilir ===
  call npm install
  if errorlevel 1 (
    echo Kurulum basarisiz.
    pause
    exit /b 1
  )
)

echo.
echo === BetTracker baslatiliyor ===
echo Tarayicida http://localhost:5173/BetTracker/ adresini ac.
echo Bu pencereyi acik birak.
echo.
call npm run dev
pause
