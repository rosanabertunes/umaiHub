@echo off
chcp 65001 > nul
echo ======================================================
echo    UMAI SUSHI — INICIANDO PRINT AGENT (WINDOWS)
echo ======================================================
echo.

node -v >nul 2>&1
if errorlevel 1 (
    echo [ERRO] O Node.js nao foi encontrado no seu computador!
    echo Instale o Node.js em: https://nodejs.org
    echo.
    pause
    exit /b 1
)

cd /d "%~dp0"

echo [1/3] Verificando modulo nativo Windows Spooler RAW...
if not exist "raw_spooler.exe" (
    if exist "raw_spooler.cs" (
        set "CSC_PATH=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
        if not exist "%CSC_PATH%" set "CSC_PATH=C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
        if exist "%CSC_PATH%" (
            echo Compilando raw_spooler.exe com .NET Framework nativo...
            "%CSC_PATH%" /nologo /optimize+ /target:exe /out:raw_spooler.exe raw_spooler.cs
            if errorlevel 1 (
                echo.
                echo [ERRO CRITICO] Falha ao compilar raw_spooler.cs!
                echo Verifique as mensagens de erro do compilador csc.exe acima.
                echo O fallback do PowerShell foi desativado por estabilidade.
                pause
                exit /b 1
            )
        ) else (
            echo [ERRO CRITICO] Compilador csc.exe nao encontrado em C:\Windows\Microsoft.NET\Framework!
            echo Instale o .NET Framework ou copie raw_spooler.exe pre-compilado.
            pause
            exit /b 1
        )
    ) else (
        echo [ERRO CRITICO] Arquivo raw_spooler.cs nao encontrado!
        pause
        exit /b 1
    )
)
if exist "raw_spooler.exe" (
    echo [OK] Modulo nativo raw_spooler.exe pronto (resposta imediata sem Add-Type).
) else (
    echo [ERRO CRITICO] raw_spooler.exe nao foi gerado.
    pause
    exit /b 1
)
echo.

echo [2/3] Compilando arquivos TypeScript...
call npm run build
if errorlevel 1 (
    echo [ERRO] Falha na compilacao do Print Agent.
    pause
    exit /b 1
)

echo [3/3] Iniciando Print Agent com listener Firestore...
echo.
node dist/index.js

echo.
pause
