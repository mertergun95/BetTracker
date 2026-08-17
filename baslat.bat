@echo off
REM Sync + serve in one go. Double-click this. Leave the window open.
cd /d "%~dp0"
echo === Fetching bets from Stake ===
python -m stakebet.cli sync
if errorlevel 1 (
  echo.
  echo Sync failed. The server still starts with whatever is already stored.
  echo.
)
echo.
echo === Starting local server ===
echo Leave this window open while you use the dashboard.
python -m stakebet.cli serve
pause
