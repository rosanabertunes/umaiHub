import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from './firebase.js';
import { loadConfig } from './config.js';
import { logger } from './logger.js';

async function createTestJob() {
  console.log('\n======================================================');
  console.log('    UMAI SUSHI — GERADOR DE TESTE FIRESTORE PRINT JOB');
  console.log('======================================================\n');

  const config = loadConfig();
  const db = getDb();
  const { restaurantId } = config;
  const role = (config.printerRole && config.printerRole !== 'TODOS' ? config.printerRole : 'CAIXA');

  console.log(`Restaurante: "${restaurantId}"`);
  console.log(`Setor (Role): "${role}"`);
  console.log(`Banco Firestore ID: "${config.firestoreDatabaseId || '(default)'}"`);
  console.log(`Inserindo novo job em: /restaurants/${restaurantId}/printJobs...\n`);

  const printJobsRef = db
    .collection('restaurants')
    .doc(restaurantId)
    .collection('printJobs');

  const testPayload = {
    restaurantId,
    printerRole: role,
    status: 'pending',
    content: {
      title: 'TESTE MANUAL FIRESTORE -> PRINT AGENT',
      message: 'Pedido de validacao da fila de impressao em tempo real',
      items: [
        { name: '1x Temaki Salmao Completo', price: 32.90 },
        { name: '8x Uramaki Philadelphia Especial', price: 38.00 },
        { name: '2x Coca-Cola Zero Lata', price: 16.00 }
      ]
    },
    createdAt: FieldValue.serverTimestamp(),
    retryCount: 0
  };

  const newDocRef = await printJobsRef.add(testPayload);

  logger.ok(`[SUCESSO] Job criado com sucesso no Firestore!`);
  console.log(`ID do Documento: ${newDocRef.id}`);
  console.log(`Status inicial : pending`);
  console.log(`Fila de destino: /restaurants/${restaurantId}/printJobs/${newDocRef.id}\n`);
  console.log(`Se o Print Agent estiver rodando ("npm start"), ele ira:`);
  console.log(`1. Capturar o job imediatamente via snapshot`);
  console.log(`2. Efetuar o claim atomico (processing)`);
  console.log(`3. Enviar o buffer RAW para o Windows Spooler`);
  console.log(`4. Imprimir na ${config.printerName}`);
  console.log(`5. Marcar como "completed" no Firestore.\n`);
}

createTestJob().catch((err) => {
  logger.error('Falha ao gerar job de teste no Firestore:', err.message);
  process.exit(1);
});
