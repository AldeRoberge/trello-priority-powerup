@echo off
rem Adds the /life (or /work) sign-in address to your Google OAuth client and checks it. Usage: add-redirect-uri.cmd [life^|work]
set APP=%1
if "%APP%"=="" set APP=life
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0add-redirect-uri.ps1" -App %APP%
pause
