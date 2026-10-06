@echo off
chcp 65001 > nul
echo ======================================================
echo    UMAI SUSHI — CRIAR JOB DE TESTE NO FIRESTORE
echo ======================================================
echo.

node -v >nul 2>&1
if errorlevel 1 (
    echo [ERRO] O Node.js nao foi encontrado no seu computador!
    pause
    exit /b 1
)

cd /d "%~dp0"

echo Enviando job pendente para a fila Firestore...
echo.
npm run test-firestore-job

echo.
pause
