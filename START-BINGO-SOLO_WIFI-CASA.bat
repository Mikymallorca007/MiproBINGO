@echo off
title Aldea Bella Bingo — Lanzador
color 0E

echo.
echo ============================================
echo    ALDEA BELLA BINGO — Iniciando sistema
echo ============================================
echo.

REM ────── 1. Matar procesos previos (por si acaso) ──────
echo [1/5] Cerrando procesos previos...
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM ngrok.exe >nul 2>&1
timeout /t 1 /nobreak >nul

REM ────── 2. Arrancar servidor Node ──────
echo [2/5] Arrancando servidor de Aldea Bella...
cd /d "%~dp0"
start "AB-Server" /min cmd /k "node server.js"
timeout /t 5 /nobreak >nul

REM ────── 3. Arrancar ngrok ──────
echo [3/5] Arrancando tunel ngrok...
start "AB-Ngrok" /min cmd /k "ngrok http https://localhost:3000 --host-header=rewrite"
timeout /t 4 /nobreak >nul

REM ────── 4. Comprobar que el servidor responde ──────
echo [4/5] Comprobando servidor...
curl.exe -k -s https://localhost:3000/health >nul 2>&1
if errorlevel 1 (
  echo.
  echo  ⚠️  ADVERTENCIA: El servidor no responde en localhost:3000
  echo      Revisa la ventana "AB-Server" para ver el error.
  echo.
  pause
)

REM ────── 5. Abrir el master en el navegador ──────
echo [5/5] Abriendo panel del master...
start "" "https://localhost:3000/master"

echo.
echo ============================================
echo    ✅ Todo listo. Sistema en marcha.
echo ============================================
echo.
echo  El servidor y ngrok estan corriendo minimizados.
echo  NO cierres sus ventanas hasta terminar la partida.
echo.
echo  Este lanzador se cerrara en 5 segundos...
timeout /t 5 /nobreak >nul
exit