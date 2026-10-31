@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao foi encontrado. Instale Node.js 24 ou superior para usar a escala.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Preparar Servidor.ps1"
if errorlevel 2 (
  pause
  exit /b 1
)
if errorlevel 1 (
  start "Servidor da Escala" /D "%~dp0" cmd /k node --watch server.mjs
  timeout /t 3 /nobreak >nul
)
start "" "http://localhost:3000"
