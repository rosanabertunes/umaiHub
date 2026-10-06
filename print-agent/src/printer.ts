import { listWindowsPrinters, sendRawToWindowsSpooler } from './winspool.js';
import { PrintResult, WindowsPrinterInfo } from './types.js';
import { logger } from './logger.js';

export interface PrinterValidationResult {
  found: boolean;
  info?: WindowsPrinterInfo;
  divergence?: {
    configured: string;
    suggested: string;
  };
  availablePrinters: WindowsPrinterInfo[];
  error?: string;
}

/**
 * Valida a existência e disponibilidade da impressora no Windows com correspondência exata.
 * NUNCA seleciona uma impressora aproximada silenciosamente.
 */
export async function validatePrinter(targetName: string): Promise<PrinterValidationResult> {
  const printers = await listWindowsPrinters();

  if (!printers || printers.length === 0) {
    return {
      found: false,
      availablePrinters: [],
      error: 'Nenhuma impressora encontrada no Windows Spooler. Certifique-se de que o driver da Epson está instalado.'
    };
  }

  const cleanTarget = targetName.trim().toLowerCase();

  // 1. Busca exata obrigatória (case-insensitive)
  const exact = printers.find(p => p.name.trim().toLowerCase() === cleanTarget);
  if (exact) {
    if (exact.isOffline) {
      return {
        found: true,
        info: exact,
        availablePrinters: printers,
        error: `A impressora "${exact.name}" foi encontrada, mas consta como OFFLINE no Windows. Conecte o cabo USB e ligue a impressora.`
      };
    }
    return { found: true, info: exact, availablePrinters: printers };
  }

  // 2. Se o nome exato NÃO existir, verificar se existe nome divergente (ex: TM-T20 vs TM-T20X)
  const partial = printers.find(p => {
    const pName = p.name.toLowerCase();
    return pName.includes('epson') || pName.includes('tm-t') || pName.includes('receipt') || pName.includes(cleanTarget) || cleanTarget.includes(pName);
  });

  return {
    found: false,
    divergence: partial ? { configured: targetName, suggested: partial.name } : undefined,
    availablePrinters: printers,
    error: partial
      ? `DIVERGENCIA DE IMPRESSORA: Configurada "${targetName}", mas localizada "${partial.name}" no Windows. O agente foi interrompido para evitar envio incorreto.`
      : `Impressora "${targetName}" não foi localizada no Windows Spooler.`
  };
}

/**
 * Envia um buffer ESC/POS para a impressora configurada
 */
export async function printRawBuffer(printerName: string, buffer: Buffer): Promise<PrintResult> {
  logger.info(`Iniciando envio RAW para "${printerName}" (${buffer.length} bytes)...`);

  const validation = await validatePrinter(printerName);

  if (!validation.found) {
    const errorMsg = validation.error || `Impressora "${printerName}" não encontrada com correspondência exata.`;
    logger.error(errorMsg);
    return {
      success: false,
      printerName,
      bytesSent: 0,
      timestamp: new Date().toISOString(),
      errorCode: 404,
      errorMessage: errorMsg
    };
  }

  if (validation.info?.isOffline) {
    logger.warn(`Atenção: A impressora "${printerName}" está marcada como OFFLINE no Windows Spooler.`);
  }

  const result = await sendRawToWindowsSpooler(printerName, buffer);

  if (result.success) {
    logger.ok(`Impressão enviada com sucesso ao Spooler do Windows! (${result.bytesSent} bytes)`);
  } else {
    logger.error(`Falha no envio para "${printerName}": ${result.errorMessage} (Código: ${result.errorCode})`);
  }

  return result;
}
