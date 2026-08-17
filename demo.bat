@echo off
REM Starts the server with the demo data only. No token needed.
cd /d "%~dp0"
python -m stakebet.cli serve
pause
