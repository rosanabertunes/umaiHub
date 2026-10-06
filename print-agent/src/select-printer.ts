import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listWindowsPrinters } from './winspool.js';
import { loadConfig } from './config.js';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function selectPrinter() {
  console.log('\n======================================================');
  console.log('   UMAI SUSHI — SELETOR DE IMPRESSORA (WINDOWS SPOOLER)');
  console.log('======================================================\n');

  const configPath = path.resolve(__dirname, '../config.json');
  const currentConfig = loadConfig();

  console.log(`Impressora atualmente configurada: "${currentConfig.printerName}"\n`);
  console.log('Consultando impressoras ativas no Windows Spooler...');

  const printers = await listWindowsPrinters();

  if (printers.length === 0) {
    logger.warn('Nenhuma impressora encontrada no Windows Spooler.');
    console.log('Verifique se o cabo USB da Epson está conectado e o driver instalado.\n');
    return;
  }

  console.log(`\nImpressoras encontradas no Windows:\n`);

  printers.forEach((p, index) => {
    const num = index + 1;
    const isCurrent = p.name.trim().toLowerCase() === currentConfig.printerName.trim().toLowerCase();
    const isEpson = p.name.toLowerCase().includes('epson') || 
                    p.name.toLowerCase().includes('tm-t') || 
                    p.name.toLowerCase().includes('receipt');

    let badge = '';
    if (isCurrent) badge = ' ⭐ [CONFIGURADA ATUALMENTE]';
    else if (isEpson) badge = ' 👉 [RECOMENDADA - EPSON TÉRMICA]';

    console.log(`  [${num}] "${p.name}"${badge}`);
    console.log(`      Porta: ${p.portName || 'N/A'} | Driver: ${p.driverName || 'N/A'} | Status: ${p.status}`);
    console.log('');
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('Digite o número da impressora para a Epson TM-T20X (ou 0 para cancelar): ', (answer) => {
    const choice = parseInt(answer.trim(), 10);

    if (isNaN(choice) || choice <= 0 || choice > printers.length) {
      console.log('\nNenhuma alteração realizada. A configuração anterior foi mantida.\n');
      rl.close();
      return;
    }

    const selected = printers[choice - 1];
    console.log(`\nVocê selecionou: "${selected.name}"`);

    try {
      let rawConfig: any = {};
      if (fs.existsSync(configPath)) {
        rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }
      rawConfig.printerName = selected.name;
      fs.writeFileSync(configPath, JSON.stringify(rawConfig, null, 2), 'utf-8');

      console.log('\n======================================================');
      logger.ok(`CONFIGURAÇÃO ATUALIZADA COM SUCESSO!`);
      console.log(`Arquivo: ${configPath}`);
      console.log(`Nova impressora gravada: "${selected.name}"`);
      console.log('======================================================\n');
    } catch (err: any) {
      logger.error('Erro ao salvar config.json:', err.message);
    }

    rl.close();
  });
}

selectPrinter().catch((err) => {
  logger.error('Erro na ferramenta de selecao:', err);
  process.exit(1);
});
