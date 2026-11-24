@echo off
chcp 65001 >nul
title Aldea Bella Bingo - Parar todo
color 0C

echo.
echo ============================================
echo    ALDEA BELLA BINGO - Deteniendo sistema
echo ============================================
echo.

echo [1/4] Solicitando cierre limpio del servidor Node...
REM Pide al servidor que se cierre para que guarde el config.json
taskkill /IM node.exe >nul 2>&1

echo [2/4] Esperando 3 segundos para que guarde los datos...
timeout /t 3 /nobreak >nul

echo [3/4] Forzando cierre de procesos...
REM Si no se cerro solo, lo matamos a la fuerza
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM ngrok.exe >nul 2>&1

echo [4/4] Cerrando las ventanas AB-Server y AB-Ngrok...
taskkill /F /FI "WINDOWTITLE eq AB-Server" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq AB-Ngrok" >nul 2>&1

echo.
echo [OK] Todo detenido y ventanas cerradas.
echo.
timeout /t 2 /nobreak >nul
exit