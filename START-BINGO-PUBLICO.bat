@echo off
chcp 65001 >nul
title Aldea Bella Bingo - Lanzador PUBLICO
color 0E

echo.
echo ============================================
echo    ALDEA BELLA BINGO - Iniciando (PUBLICO)
echo ============================================
echo.

REM ------ 1. Matar procesos previos ------
echo [1/6] Cerrando procesos previos...
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM ngrok.exe >nul 2>&1
timeout /t 1 /nobreak >nul

REM ------ 2. Arrancar servidor Node ------
echo [2/6] Arrancando servidor de Aldea Bella...
cd /d "%~dp0"
start "AB-Server" /min cmd /k "chcp 65001 >nul && node server.js"
timeout /t 5 /nobreak >nul

REM ------ 3. Arrancar ngrok ------
echo [3/6] Arrancando tunel ngrok...
start "AB-Ngrok" /min cmd /k "chcp 65001 >nul && ngrok http https://192.168.1.52:3000 --url=https://imposing-foe-untainted.ngrok-free.dev --host-header=rewrite"
timeout /t 6 /nobreak >nul

REM ------ 4. Obtener la URL de ngrok ------
echo [4/6] Obteniendo URL publica de ngrok...
set "PUBLIC_URL="

for /f "delims=" %%a in ('powershell -NoProfile -Command "try { (Invoke-RestMethod http://localhost:4040/api/tunnels).tunnels[0].public_url } catch { }" 2^>nul') do set "PUBLIC_URL=%%a"

if "%PUBLIC_URL%"=="" (
  echo.
  echo  [!] No se ha podido detectar la URL de ngrok automaticamente.
  echo.
  set /p PUBLIC_URL="  Pega manualmente tu URL de ngrok (ej: https://abcd.ngrok-free.dev): "
)

if "%PUBLIC_URL%"=="" (
  echo.
  echo  [X] No hay URL publica. Abortando.
  pause
  exit /b 1
)

echo.
echo  [OK] URL Publica detectada: %PUBLIC_URL%

REM ------ 5. Actualizar config.json con la nueva URL ------
echo.
echo [5/6] Actualizando config.json con la URL publica...
node update-url.js "%PUBLIC_URL%"
if errorlevel 1 (
  echo    [!] No se pudo actualizar config.json automaticamente.
) else (
  echo    [OK] config.json actualizado ^(UTF-8 sin BOM^).
)

timeout /t 2 /nobreak >nul

REM ------ 6. Abrir el master ------
echo [6/6] Abriendo panel del master...
start "" "%PUBLIC_URL%/master"

echo.
echo ============================================
echo    [OK] Todo listo. Sistema en marcha.
echo ============================================
echo.
echo  Servidor:  AB-Server  (minimizado)
echo  Ngrok:     AB-Ngrok   (minimizado)
echo.
echo  URL Publica:  %PUBLIC_URL%
echo  Master:       %PUBLIC_URL%/master
echo  Display:      %PUBLIC_URL%/display
echo  Jugador:      %PUBLIC_URL%/
echo.
echo  Este lanzador se cerrara en 10 segundos...
timeout /t 10 /nobreak >nul
exit