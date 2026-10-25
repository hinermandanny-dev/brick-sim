@echo off
rem Brick Sim: download the latest game + map, then start it. Needs Node.js. Your home address (local\) is never touched.
cd /d "%~dp0"
node tools\update.mjs
if errorlevel 1 (echo. & echo Update failed - starting the version you already have. & timeout /t 4 >nul)
call PLAY.cmd
