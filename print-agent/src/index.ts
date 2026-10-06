import net from 'node:net';
import { loadConfig } from './config.js';
import { validatePrinter } from './printer.js';
import { FirestorePrintListener } from './firestore-print-listener.js';
import { logger } from './logger.js';

const SINGLE_INSTANCE_PORT = 41890;

function acquireSingleInstanceLock(): Promise<net.Server> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.error('\n======================================================');
        console.error('[BLOQUEIO DE DUPLICIDADE] PRINT AGENT JA EM EXECUCAO!');
        console.error('======================================================');
        console.error('Ja existe uma instancia ativa do Print Agent escutando neste computador.');
        console.error('Para impedir duplicidade de impressoes na Epson TM-T20X,');
        console.error('esta segunda tentativa foi cancelada com seguranca.');
        console.error('\nComo localizar ou gerenciar a instancia ativa no Windows:');
        console.error('1. Verifique se ja existe uma janela aberta: "Prompt de Comando - UMAI SUSHI"');
        console.error('2. Execute o arquivo "diagnostico.bat" para identificar o PID do processo em execucao.');
        console.error('3. No Prompt de Comando, digite: netstat -ano | findstr :41890');
        console.error('======================================================\n');
        process.exit(0);
      } else {
        logger.warn(`Aviso de verificacao de porta local: ${err.message}`);
        resolve(server);
      }
    });

    server.listen(SINGLE_INSTANCE_PORT, '127.0.0.1', () => {
      logger.ok(`[INSTANCIA UNICA] Trava local ativa: Processo PID ${process.pid} (Porta ${SINGLE_INSTANCE_PORT})`);
      resolve(server);
    });
  });
}

async function startAgent() {
  await acquireSingleInstanceLock();

  console.log('\n======================================================');
  console.log('       UMAI SUSHI — PRINT AGENT WINDOWS v1.0.0');
  console.log('======================================================');
  console.log('Agente autonomo de impressao ESC/POS RAW para Windows Spooler');
  console.log('Integrado a fila em tempo real do Cloud Firestore\n');

  const config = loadConfig();
  logger.info(`Carregando configuracao...`);
  logger.info(`Impressora configurada: "${config.printerName}"`);
  logger.info(`Largura de papel: ${config.paperWidth} colunas (80mm)`);
  logger.info(`Corte automatico de papel: ${config.autoCut ? 'Habilitado' : 'Desabilitado'}`);
  logger.info(`Restaurante ID: "${config.restaurantId}"`);
  logger.info(`Setores escutados: [${config.printerRoles.join(', ')}]`);
  logger.info(`Banco de Dados Firestore: "${config.firestoreDatabaseId || '(default)'}"`);

  logger.info(`Verificando conectividade com o Windows Spooler...`);
  const validation = await validatePrinter(config.printerName);

  if (validation.found) {
    logger.ok(`Impressora confirmada no Spooler: "${validation.info?.name}"`);
    logger.info(`Porta do Windows: ${validation.info?.portName || 'USB'}`);
    logger.info(`Driver ativo: ${validation.info?.driverName || 'Padrao'}`);
    logger.info(`Status do dispositivo: ${validation.info?.status || 'Pronta'}`);

    if (validation.info?.isOffline) {
      logger.warn(`ATENCAO: A impressora esta marcada como OFFLINE no Windows. Conecte o cabo USB e ligue a impressora.`);
    }

    console.log('\n------------------------------------------------------');
    logger.ok(`[VALIDACAO SPOOLER OK]`);
    console.log(`Conectando agente aos setores [${config.printerRoles.join(', ')}] na fila do Firestore...`);
    console.log('------------------------------------------------------\n');

    try {
      const listener = new FirestorePrintListener(config);
      const stopListener = listener.start();

      const handleExit = () => {
        console.log('\n[AGENT] Encerrando Print Agent com seguranca...');
        stopListener();
        process.exit(0);
      };

      process.on('SIGINT', handleExit);
      process.on('SIGTERM', handleExit);
    } catch (err: any) {
      logger.error(`Nao foi possivel iniciar o listener do Firestore:`, err.message);
      console.log('\nVerifique se o arquivo "service-account.json" esta na pasta print-agent/ ou se');
      console.log('a variavel GOOGLE_APPLICATION_CREDENTIALS esta definida corretamente.');
      console.log('\nVoce ainda pode realizar testes locais com:');
      console.log('> npm run test-print\n');
      process.exit(1);
    }
  } else {
    console.error('\n======================================================');
    if (validation.divergence) {
      console.error('[BLOQUEIO] DIVERGENCIA NO NOME DA IMPRESSORA!');
      console.error('======================================================');
      console.error(`Nome no config.json : "${validation.divergence.configured}"`);
      console.error(`Nome real no Windows: "${validation.divergence.suggested}"`);
      console.error('------------------------------------------------------');
      console.error('O agente NAO iniciou para evitar impressao no dispositivo errado.');
      console.error('Para corrigir:');
      console.error(`1. Abra "print-agent/config.json"`);
      console.error(`2. Altere "printerName" para: "${validation.divergence.suggested}"`);
      console.error('3. Salve e execute o agente novamente.\n');
    } else {
      console.error('[BLOQUEIO] IMPRESSORA NAO LOCALIZADA NO WINDOWS!');
      console.error('======================================================');
      console.error(`Nome procurado: "${config.printerName}"`);
      if (validation.availablePrinters.length > 0) {
        console.error('Impressoras detectadas no Windows:');
        validation.availablePrinters.forEach((p, i) => {
          console.error(`  [${i + 1}] "${p.name}" (Porta: ${p.portName || 'N/A'}, Status: ${p.status})`);
        });
      } else {
        console.error('Nenhuma impressora encontrada no Windows Spooler.');
      }
      console.error('\nInstale o driver da Epson TM-T20X ou ajuste o nome exato em "config.json".\n');
    }
    process.exit(1);
  }
}

startAgent().catch((err) => {
  logger.error('Falha critica na inicializacao do Print Agent:', err);
  process.exit(1);
});
