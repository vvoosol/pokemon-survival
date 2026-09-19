@echo off
cd /d "%~dp0"
node tools\local-server.cjs
if errorlevel 1 pause
