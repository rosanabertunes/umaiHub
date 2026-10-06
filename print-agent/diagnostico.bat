@echo off
chcp 65001 > nul
echo ======================================================
echo    UMAI SUSHI — DIAGNOSTICO DO PRINT AGENT
echo ======================================================
echo.

node -v >nul 2>&1
if errorlevel 1 (
    echo [ERRO] O Node.js nao foi encontrado no seu computador!
    pause
    exit /b 1
)

cd /d "%~dp0"

echo Executando verificacoes de processo, porta, impressora e banco...
echo.
call npm run diagnostico

echo.
pause
