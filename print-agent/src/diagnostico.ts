import net from 'node:net';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { validatePrinter } from './printer.js';
import { listWindowsPrinters, findRawSpoolerExe, ensureRawSpoolerCompiled } from './winspool.js';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SINGLE_INSTANCE_PORT = 41890;
const isWindows = process.platform === 'win32';

async function checkPortLock(port: number): Promise<{ isInUse: boolean; error?: string }> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1500);

    socket.once('connect', () => {
      socket.destroy();
      resolve({ isInUse: true });
    });

    socket.once('timeout', () => {
      socket.destroy();
      resolve({ isInUse: false });
    });

    socket.once('error', (err: any) => {
      socket.destroy();
      if (err.code === 'ECONNREFUSED') {
        resolve({ isInUse: false });
      } else {
        resolve({ isInUse: false, error: err.message });
      }
    });

    socket.connect(port, '127.0.0.1');
  });
}

async function runDiagnostico() {
  console.log('\n======================================================');
  console.log('   UMAI SUSHI — DIAGNOSTICO COMPLETO DO PRINT AGENT');
  console.log('======================================================\n');

  const config = loadConfig();

  // 1. CHECAGEM DE PROCESSO E TRAVA DE INSTANCIA UNICA (PORTA 41890)
  console.log('--- [1/5] TRAVA DE INSTÂNCIA E PROCESSOS NODE ---');
  const portStatus = await checkPortLock(SINGLE_INSTANCE_PORT);

  if (portStatus.isInUse) {
    console.log(`[STATUS] PORTA ${SINGLE_INSTANCE_PORT}: EM USO`);
    console.log('Existe uma instancia do Print Agent ativa neste computador.');
  } else {
    console.log(`[STATUS] PORTA ${SINGLE_INSTANCE_PORT}: LIVRE`);
    console.log('Nenhuma instancia do Print Agent esta travando a porta neste momento.');
  }

  if (isWindows) {
    try {
      console.log('\nProcessos Node.js em execucao no Windows:');
      const tasklist = execSync('tasklist /FI "IMAGENAME eq node.exe" /FO TABLE', { encoding: 'utf-8', timeout: 5000 });
      console.log(tasklist.trim());

      const netstat = execSync(`netstat -ano | findstr :${SINGLE_INSTANCE_PORT} || exit /b 0`, { encoding: 'utf-8', timeout: 5000 });
      if (netstat.trim()) {
        console.log(`\nConexao na porta ${SINGLE_INSTANCE_PORT}:`);
        console.log(netstat.trim());
        const match = netstat.match(/LISTENING\s+(\d+)/i) || netstat.match(/:41890\s+.*?(\d+)$/m);
        if (match && match[1]) {
          console.log(`\n-> O processo PID ${match[1]} esta escutando na porta do Print Agent.`);
          console.log(`-> Se precisar encerra-lo forcado, execute:`);
          console.log(`   taskkill /PID ${match[1]} /F\n`);
        }
      }
    } catch (e: any) {
      console.log('Nota sobre listagem de processos:', e.message);
    }
  }

  // 2. CONFIGURACAO E SETORES ATENDIDOS
  console.log('\n--- [2/5] CONFIGURACAO DO AGENTE ---');
  console.log(`Impressora configurada : "${config.printerName}"`);
  console.log(`Largura do papel       : ${config.paperWidth} colunas (80mm)`);
  console.log(`Corte automatico       : ${config.autoCut ? 'SIM' : 'NAO'}`);
  console.log(`Restaurante ID         : "${config.restaurantId}"`);
  console.log(`Setores atendidos      : [${config.printerRoles.join(', ')}]`);
  console.log(`Banco Firestore ID     : "${config.firestoreDatabaseId || '(default)'}"`);

  // 3. CREDENCIAIS FIREBASE (service-account.json)
  console.log('\n--- [3/5] CREDENCIAIS FIREBASE ---');
  const serviceAccountCandidates = [
    path.resolve(process.cwd(), 'service-account.json'),
    path.resolve(process.cwd(), 'print-agent/service-account.json'),
    path.resolve(__dirname, '../service-account.json'),
    path.resolve(__dirname, '../../service-account.json'),
  ];
  let saFound: string | null = null;
  for (const c of serviceAccountCandidates) {
    if (fs.existsSync(c)) {
      saFound = c;
      break;
    }
  }

  if (saFound) {
    console.log(`[OK] Chave de servico encontrada em: ${saFound}`);
    try {
      const sa = JSON.parse(fs.readFileSync(saFound, 'utf-8'));
      console.log(`     Projeto ID na chave: "${sa.project_id || 'N/A'}"`);
      console.log(`     Email de servico   : "${sa.client_email || 'N/A'}"`);
    } catch {}
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    console.log(`[OK] Variavel GOOGLE_APPLICATION_CREDENTIALS ativa: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);
  } else {
    console.log('[BLOQUEIO] Arquivo "service-account.json" nao encontrado nesta pasta!');
    console.log('Para conectar a fila Firestore, baixe a chave privada no Firebase Console');
    console.log('e salve como "service-account.json" dentro de "print-agent/".');
  }

  // 4. IMPRESSORA NO WINDOWS SPOOLER
  console.log('\n--- [4/5] VALIDAÇÃO DA IMPRESSORA NO SPOOLER ---');
  const validation = await validatePrinter(config.printerName);
  if (validation.found) {
    console.log(`[OK] Impressora localizada com nome exato: "${validation.info?.name}"`);
    console.log(`     Porta : ${validation.info?.portName || 'USB'}`);
    console.log(`     Driver: ${validation.info?.driverName || 'Padrao'}`);
    console.log(`     Status: ${validation.info?.status || 'Pronta'}`);
    if (validation.info?.isOffline) {
      console.log('     [ATENÇÃO] A impressora consta como OFFLINE no Windows.');
    }
  } else if (validation.divergence) {
    console.log(`[DIVERGENCIA CRITICA DETECTADA]`);
    console.log(`Nome configurado no config.json : "${validation.divergence.configured}"`);
    console.log(`Nome real encontrado no Windows : "${validation.divergence.suggested}"`);
    console.log(`Acao: Altere "printerName" em config.json para "${validation.divergence.suggested}".`);
  } else {
    console.log(`[NAO ENCONTRADA] Impressora "${config.printerName}" nao existe no Windows.`);
    if (validation.availablePrinters.length > 0) {
      console.log('Impressoras disponiveis no Windows:');
      validation.availablePrinters.forEach(p => console.log(` - "${p.name}" (${p.portName})`));
    }
  }

  // 5. MODULO NATIVO RAW SPOOLER
  console.log('\n--- [5/5] MODULO NATIVO RAW SPOOLER ---');
  const exePath = findRawSpoolerExe();
  if (exePath) {
    console.log(`[OK] Executavel compilado encontrado: ${exePath}`);
  } else {
    console.log('Executavel raw_spooler.exe nao pre-compilado. Testando csc.exe...');
    const compileResult = ensureRawSpoolerCompiled();
    if (compileResult.exe) {
      console.log(`[OK] Compilacao automatica com csc.exe bem-sucedida: ${compileResult.exe}`);
    } else {
      console.log(`[BLOQUEIO] Falha na compilacao nativa: ${compileResult.error}`);
    }
  }

  console.log('\n======================================================');
  console.log('Fim do diagnostico.');
  console.log('======================================================\n');
}

runDiagnostico().catch(err => {
  console.error('Erro no diagnostico:', err);
});
