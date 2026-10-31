@echo off
title Low Range server
cd /d "%~dp0"
where node >nul 2>nul || (
  echo Node.js is not installed. Get the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)
echo Starting Low Range. Share the "Friends open" address below with up to 2 friends on this Wi-Fi.
node server.js
pause
