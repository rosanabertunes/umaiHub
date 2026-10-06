import { execFile, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WindowsPrinterInfo, PrintResult } from './types.js';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isWindows = process.platform === 'win32';

/**
 * Traduz códigos de erro Win32 nativos para mensagens claras em português
 */
export function getWin32ErrorMessage(code: number): string {
  switch (code) {
    case 1801:
      return 'Nome da impressora inválido ou dispositivo não encontrado no Windows (ERROR_INVALID_PRINTER_NAME).';
    case 5:
      return 'Acesso negado ao spooler de impressão (ERROR_ACCESS_DENIED). Tente executar como Administrador.';
    case 6:
      return 'Identificador de impressora inválido (ERROR_INVALID_HANDLE).';
    case 1722:
      return 'O serviço Spooler de Impressão do Windows está parado ou inacessível (RPC_S_SERVER_UNAVAILABLE).';
    case 122:
      return 'A área de transferência para envio ao spooler é insuficiente (ERROR_INSUFFICIENT_BUFFER).';
    case 0:
      return 'Operação concluída com sucesso.';
    default:
      return `Código de erro retornado pela API WinSpool: ${code}.`;
  }
}

/**
 * Lista todas as impressoras instaladas no Windows Spooler
 */
export async function listWindowsPrinters(): Promise<WindowsPrinterInfo[]> {
  if (!isWindows) {
    logger.debug(`Ambiente atual (${process.platform}) não é Windows. Retornando impressora simulada.`);
    return [
      {
        name: 'EPSON TM-T20X Receipt',
        portName: 'USB001',
        driverName: 'EPSON TM-T20X Receipt',
        isDefault: true,
        isOffline: false,
        status: 'OK (Ambiente Simulado)'
      }
    ];
  }

  return new Promise((resolve) => {
    const psScript = `
      Get-CimInstance Win32_Printer | Select-Object Name, PortName, DriverName, Default, WorkOffline, PrinterStatus | ConvertTo-Json -Compress
    `;

    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], { timeout: 8000 }, (error, stdout) => {
      if (error || !stdout.trim()) {
        logger.warn('Falha ao listar impressoras via PowerShell CIM. Tentando comando alternativo...');
        resolve(listWindowsPrintersFallback());
        return;
      }

      try {
        const parsed = JSON.parse(stdout.trim());
        const list = Array.isArray(parsed) ? parsed : [parsed];

        const printers: WindowsPrinterInfo[] = list.map((item: any) => ({
          name: item.Name || 'Desconhecida',
          portName: item.PortName || '',
          driverName: item.DriverName || '',
          isDefault: Boolean(item.Default),
          isOffline: Boolean(item.WorkOffline),
          status: item.WorkOffline ? 'Offline' : 'Pronta'
        }));

        resolve(printers);
      } catch {
        resolve([]);
      }
    });
  });
}

function listWindowsPrintersFallback(): WindowsPrinterInfo[] {
  try {
    const psFallback = `
      try {
        Get-Printer | Select-Object Name, PortName, DriverName, @{Name='Default';Expression={$_.Default}}, @{Name='WorkOffline';Expression={$_.PrinterStatus -eq 'Offline'}} | ConvertTo-Json -Compress
      } catch {
        [System.Drawing.Printing.PrinterSettings]::InstalledPrinters | ForEach-Object {
          [PSCustomObject]@{ Name = $_; PortName = ''; DriverName = ''; Default = $false; WorkOffline = $false }
        } | ConvertTo-Json -Compress
      }
    `;
    const output = execSync(`powershell.exe -NoProfile -NonInteractive -Command "${psFallback.replace(/\n/g, ' ')}"`, { encoding: 'utf-8', timeout: 6000 });
    const parsed = JSON.parse(output.trim());
    const list = Array.isArray(parsed) ? parsed : [parsed];

    return list.map((item: any) => ({
      name: item.Name || 'Desconhecida',
      portName: item.PortName || '',
      driverName: item.DriverName || '',
      isDefault: Boolean(item.Default),
      isOffline: Boolean(item.WorkOffline),
      status: item.WorkOffline ? 'Offline' : 'Pronta'
    }));
  } catch {
    return [];
  }
}

/**
 * Localiza o executável compilado nativo raw_spooler.exe
 */
export function findRawSpoolerExe(): string | null {
  const candidates = [
    path.resolve(process.cwd(), 'raw_spooler.exe'),
    path.resolve(process.cwd(), 'print-agent/raw_spooler.exe'),
    path.resolve(__dirname, '../raw_spooler.exe'),
    path.resolve(__dirname, '../../raw_spooler.exe'),
    path.resolve(__dirname, 'raw_spooler.exe'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

export interface RawSpoolerResult {
  exe: string | null;
  error?: string;
}

/**
 * Tenta localizar ou compilar raw_spooler.cs para raw_spooler.exe usando csc.exe do .NET nativo.
 * Se não for possível compilar, retorna o erro real e não faz fallback silencioso.
 */
export function ensureRawSpoolerCompiled(): RawSpoolerResult {
  const existing = findRawSpoolerExe();
  if (existing) return { exe: existing };

  const csFileCandidates = [
    path.resolve(process.cwd(), 'raw_spooler.cs'),
    path.resolve(process.cwd(), 'print-agent/raw_spooler.cs'),
    path.resolve(__dirname, '../raw_spooler.cs'),
    path.resolve(__dirname, '../../raw_spooler.cs'),
    path.resolve(__dirname, 'raw_spooler.cs')
  ];

  let csFile: string | null = null;
  for (const candidate of csFileCandidates) {
    if (fs.existsSync(candidate)) {
      csFile = candidate;
      break;
    }
  }

  if (!csFile) {
    return {
      exe: null,
      error: `Arquivo fonte raw_spooler.cs não foi localizado em: ${csFileCandidates.join(', ')}`
    };
  }

  const targetExe = path.resolve(path.dirname(csFile), 'raw_spooler.exe');
  const cscCandidates = [
    'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
    'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
    'csc.exe'
  ];

  let lastError = 'Nenhum compilador C# (csc.exe) foi localizado no Windows.';
  let foundCsc = false;

  for (const csc of cscCandidates) {
    try {
      if (csc !== 'csc.exe' && !fs.existsSync(csc)) {
        continue;
      }
      foundCsc = true;
      execSync(`"${csc}" /nologo /optimize+ /target:exe /out:"${targetExe}" "${csFile}"`, {
        timeout: 12000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });

      if (fs.existsSync(targetExe)) {
        logger.ok(`[SPOOLER] Compilação nativa concluída com sucesso: ${targetExe}`);
        return { exe: targetExe };
      }
    } catch (err: any) {
      lastError = err.stderr || err.stdout || err.message || String(err);
      logger.error(`[SPOOLER] Falha na compilação com "${csc}": ${lastError}`);
    }
  }

  return {
    exe: null,
    error: foundCsc 
      ? `Erro na compilação do raw_spooler.cs via csc.exe: ${lastError}`
      : `Compilador csc.exe não encontrado em C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\`
  };
}

/**
 * Envia um buffer de bytes ESC/POS diretamente para o Windows Spooler com datatype RAW.
 * 
 * Utiliza o binário nativo raw_spooler.exe que invoca P/Invoke nativo com winspool.drv:
 * OpenPrinter -> StartDocPrinter (RAW) -> StartPagePrinter -> WritePrinter -> EndPagePrinter -> EndDocPrinter -> ClosePrinter
 */
export async function sendRawToWindowsSpooler(printerName: string, data: Buffer): Promise<PrintResult> {
  const timestamp = new Date().toISOString();

  if (!isWindows) {
    logger.warn(`[SIMULAÇÃO] Spooler RAW invocado para impressora "${printerName}" (${data.length} bytes).`);
    logger.warn(`[SIMULAÇÃO] Ambiente Linux detectado. Impressão física NÃO executada.`);
    return {
      success: false,
      printerName,
      bytesSent: data.length,
      timestamp,
      isSimulated: true,
      errorCode: 999,
      errorMessage: 'Impressão física bloqueada: O ambiente atual é Linux (Simulação). Para teste físico na Epson TM-T20X, o comando deve ser executado no notebook Windows.'
    };
  }

  return new Promise((resolve) => {
    // 1. Garante que raw_spooler.exe existe ou compila estritamente
    const spoolerCheck = ensureRawSpoolerCompiled();
    if (!spoolerCheck.exe) {
      const errorMsg = spoolerCheck.error || 'raw_spooler.exe ausente e não compilável.';
      logger.error(`[ERRO CRÍTICO RAW SPOOLER] ${errorMsg}`);
      logger.error(`O fallback silencioso para Add-Type do PowerShell foi desativado por estabilidade.`);
      return resolve({
        success: false,
        printerName,
        bytesSent: 0,
        timestamp,
        errorCode: 500,
        errorMessage: errorMsg
      });
    }

    // 2. Grava temporariamente o buffer em arquivo binário no temp do SO
    const tempFilePath = path.join(os.tmpdir(), `umai_raw_${Date.now()}_${Math.random().toString(36).substring(7)}.bin`);

    try {
      fs.writeFileSync(tempFilePath, data);
    } catch (err: any) {
      return resolve({
        success: false,
        printerName,
        bytesSent: 0,
        timestamp,
        errorCode: 500,
        errorMessage: `Falha ao gravar arquivo temporário do buffer: ${err.message}`
      });
    }

    // 3. Execução direta do executável compilado nativo (tempo de resposta < 25ms)
    execFile(spoolerCheck.exe, [printerName, tempFilePath], { timeout: 10000 }, (error, stdout, stderr) => {
      try {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      } catch {}

      if (error) {
        return resolve({
          success: false,
          printerName,
          bytesSent: 0,
          timestamp,
          errorCode: 500,
          errorMessage: `Erro de execução no executável nativo Spooler (${spoolerCheck.exe}): ${error.message} ${stderr ? `Detalhe: ${stderr}` : ''}`
        });
      }

      const match = (stdout || '').match(/RESULT_CODE:(\d+)/);
      const code = match ? parseInt(match[1], 10) : -1;

      if (code === 0) {
        resolve({
          success: true,
          printerName,
          bytesSent: data.length,
          timestamp,
          errorCode: 0
        });
      } else {
        const errorMsg = getWin32ErrorMessage(code);
        resolve({
          success: false,
          printerName,
          bytesSent: 0,
          timestamp,
          errorCode: code,
          errorMessage: errorMsg
        });
      }
    });
  });
}
