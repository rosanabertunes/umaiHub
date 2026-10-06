@echo off
chcp 65001 > nul
echo ======================================================
echo    UMAI SUSHI - TESTE DO PRINT AGENT (WINDOWS)
echo ======================================================
echo.

node -v >nul 2>&1
if errorlevel 1 (
    echo [ERRO] O Node.js nao foi encontrado no seu computador!
    echo Baixe e instale o Node.js em: https://nodejs.org
    echo.
    pause
    exit /b 1
)

cd /d "%~dp0"

echo [1/3] Listando impressoras cadastradas no Windows...
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Printer | Select-Object Name, PortName, Default | Format-Table -AutoSize"
echo.

echo [2/3] Executando teste direto do Print Agent...
echo.
node direct-test.cjs

echo.
echo ======================================================
echo Teste finalizado. Pressione qualquer tecla para sair.
pause
