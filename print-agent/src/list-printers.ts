import { listWindowsPrinters } from './winspool.js';
import { loadConfig } from './config.js';
import { logger } from './logger.js';

async function runListPrinters() {
  console.log('\n======================================================');
  console.log('    UMAI SUSHI — DETECÇÃO DE IMPRESSORAS (WINDOWS)');
  console.log('======================================================\n');

  const config = loadConfig();
  logger.info(`Buscando impressoras cadastradas no Windows Spooler...\n`);

  const printers = await listWindowsPrinters();

  if (printers.length === 0) {
    logger.warn('Nenhuma impressora encontrada no Windows Spooler.');
    console.log('Certifique-se de que o driver da Epson TM-T20X foi instalado no Windows.');
    return;
  }

  console.log(`Encontrada(s) ${printers.length} impressora(s):\n`);

  let epsonFound = false;

  printers.forEach((p, idx) => {
    const isConfigured = p.name.trim().toLowerCase() === config.printerName.trim().toLowerCase();
    const isEpson = p.name.toLowerCase().includes('epson') || 
                    p.name.toLowerCase().includes('tm-t') || 
                    p.name.toLowerCase().includes('receipt');

    if (isEpson) epsonFound = true;

    console.log(`[${idx + 1}] Nome: "${p.name}" ${p.isDefault ? '(Padrão do Windows)' : ''}`);
    console.log(`    Porta: ${p.portName || 'N/A'}`);
    console.log(`    Driver: ${p.driverName || 'N/A'}`);
    console.log(`    Status: ${p.status}`);
    if (isConfigured) {
      console.log(`    ⭐ ATUALMENTE CONFIGURADA NO config.json`);
    } else if (isEpson) {
      console.log(`    👉 PROVÁVEL EPSON TÉRMICA! (Recomendado copiar este nome exato para config.json)`);
    }
    console.log('');
  });

  if (!epsonFound) {
    logger.warn('Nenhuma impressora com nome "Epson" ou "TM-T" foi identificada automaticamente.');
    console.log('Se sua impressora estiver instalada com nome genérico (ex: "Generic / Text Only" ou "Impressora Térmica"),');
    console.log('copie o nome listado acima exatamente como aparece e cole no "config.json".\n');
  }

  console.log('======================================================\n');
}

runListPrinters().catch((err) => {
  logger.error('Erro ao listar impressoras:', err);
  process.exit(1);
});
