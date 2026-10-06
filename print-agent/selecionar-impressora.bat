@echo off
chcp 65001 > nul
echo ======================================================
echo    UMAI SUSHI — SELETOR DE IMPRESSORA EPSON (WINDOWS)
echo ======================================================
echo.

node -v >nul 2>&1
if errorlevel 1 (
    echo [ERRO] O Node.js nao foi encontrado no seu computador!
    pause
    exit /b 1
)

cd /d "%~dp0"

echo Consultando impressoras instaladas no Windows Spooler...
echo.
call npm run select-printer

echo.
pause
