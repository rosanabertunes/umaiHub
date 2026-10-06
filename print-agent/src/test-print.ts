import { loadConfig } from './config.js';
import { buildTestReceipt } from './escpos.js';
import { printRawBuffer } from './printer.js';
import { logger } from './logger.js';

async function runTestPrint() {
  console.log('\n======================================================');
  console.log('       UMAI SUSHI — TESTE DO PRINT AGENT (RAW)');
  console.log('======================================================\n');

  const config = loadConfig();
  logger.info(`Carregando configuração de impressora...`);
  logger.info(`Impressora alvo: "${config.printerName}"`);
  logger.info(`Largura configurada: ${config.paperWidth} colunas`);
  logger.info(`Corte automático: ${config.autoCut ? 'Ativado' : 'Desativado'}\n`);

  // Monta os bytes ESC/POS
  const receiptBuffer = buildTestReceipt({
    restaurantName: 'UMAI SUSHI',
    printerName: config.printerName,
    width: config.paperWidth
  });

  logger.info(`Buffer ESC/POS gerado com sucesso: ${receiptBuffer.length} bytes.`);

  // Envia diretamente para o Windows Spooler
  const result = await printRawBuffer(config.printerName, receiptBuffer);

  console.log('\n------------------------------------------------------');
  if (result.success && !result.isSimulated) {
    logger.ok(`[TESTE CONCLUÍDO COM SUCESSO NO WINDOWS SPOOLER]`);
    console.log(`Impressora: ${result.printerName}`);
    console.log(`Bytes transmitidos: ${result.bytesSent} bytes`);
    console.log(`Horário: ${result.timestamp}`);
    console.log(`Verifique a saída física na Epson TM-T20X (impressão com cabeçalho UMAI SUSHI e corte de papel).`);
  } else if (result.isSimulated) {
    logger.warn(`[SIMULAÇÃO LINUX / CONTAINER DETECTADA]`);
    console.log(`O buffer ESC/POS (${result.bytesSent} bytes) foi gerado corretamente na memória.`);
    console.log(`A impressora física EPSON TM-T20X NÃO foi acionada porque o contêiner não possui porta USB/Windows.`);
    console.log(`IMPORTANTE: A validação física depende exclusivamente de executar este teste no notebook Windows com a impressora conectada.`);
  } else {
    logger.error(`[FALHA NO TESTE DE IMPRESSÃO]`);
    console.log(`Código do Erro: ${result.errorCode}`);
    console.log(`Mensagem: ${result.errorMessage}`);
    console.log('\nSugestões de Diagnóstico:');
    console.log('1. Verifique se a impressora Epson está ligada com luz azul/verde acesa.');
    console.log('2. Verifique se o cabo USB está conectado firmemente ao PC Windows.');
    console.log('3. Execute "npm run list-printers" para conferir o nome exato da impressora no Windows.');
    console.log('4. Ajuste o nome em "config.json" para coincidir com o nome exato listado.');
  }
  console.log('------------------------------------------------------\n');
}

runTestPrint().catch((err) => {
  logger.error('Erro fatal durante a execução do teste de impressão:', err);
  process.exit(1);
});
