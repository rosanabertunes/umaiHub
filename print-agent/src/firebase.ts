import { initializeApp, getApps, getApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let firestoreInstance: Firestore | null = null;

/**
 * Tenta localizar o arquivo de Service Account do Firebase se não houver GOOGLE_APPLICATION_CREDENTIALS
 */
function resolveServiceAccountPath(): string | null {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    return process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }

  const config = loadConfig();
  const configuredPath = config.serviceAccountPath || 'service-account.json';

  const candidates = [
    path.resolve(process.cwd(), configuredPath),
    path.resolve(__dirname, '..', configuredPath),
    path.resolve(__dirname, '../..', configuredPath),
    path.resolve(process.cwd(), 'service-account.json'),
    path.resolve(__dirname, '../service-account.json'),
    path.resolve(__dirname, '../../service-account.json')
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Tenta obter o Database ID do Firestore (do config.json, env ou firebase-applet-config.json)
 */
function resolveDatabaseId(): string {
  const config = loadConfig();
  if (config.firestoreDatabaseId && config.firestoreDatabaseId.trim()) {
    return config.firestoreDatabaseId.trim();
  }

  if (process.env.FIRESTORE_DATABASE_ID && process.env.FIRESTORE_DATABASE_ID.trim()) {
    return process.env.FIRESTORE_DATABASE_ID.trim();
  }

  const appletConfigCandidates = [
    path.resolve(process.cwd(), 'firebase-applet-config.json'),
    path.resolve(process.cwd(), '../firebase-applet-config.json'),
    path.resolve(__dirname, '../../firebase-applet-config.json'),
    path.resolve(__dirname, '../../../firebase-applet-config.json')
  ];

  for (const candidate of appletConfigCandidates) {
    if (fs.existsSync(candidate)) {
      try {
        const raw = JSON.parse(fs.readFileSync(candidate, 'utf-8'));
        if (raw.firestoreDatabaseId) return raw.firestoreDatabaseId;
      } catch {}
    }
  }

  // ID padrão garantido do banco do projeto Umai Sushi no AI Studio
  return 'ai-studio-0e2830d4-527a-49d2-a0f7-899d71a25e1c';
}

/**
 * Inicializa o Firebase Admin SDK de forma singleton e segura
 */
export function getDb(): Firestore {
  if (firestoreInstance) {
    return firestoreInstance;
  }

  const serviceAccountPath = resolveServiceAccountPath();

  if (getApps().length === 0) {
    if (serviceAccountPath) {
      try {
        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));
        initializeApp({
          credential: cert(serviceAccount),
          projectId: serviceAccount.project_id || 'ia-tatto-secret'
        });
        logger.ok(`[FIREBASE] Firebase Admin inicializado com chave: ${path.basename(serviceAccountPath)} (Projeto: ${serviceAccount.project_id || 'ia-tatto-secret'})`);
      } catch (err: any) {
        throw new Error(
          `[FIREBASE ERRO] Falha ao ler ou processar chave de servico em "${serviceAccountPath}": ${err.message}`
        );
      }
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      initializeApp({
        credential: applicationDefault()
      });
      logger.ok(`[FIREBASE] Firebase Admin inicializado via GOOGLE_APPLICATION_CREDENTIALS`);
    } else {
      // Produz erro claro orientando como configurar as credenciais
      const errorMsg = [
        '========================================================================',
        '[FIREBASE ERRO] Nenhuma credencial de Service Account foi encontrada!',
        '',
        'Para conectar o Print Agent ao Firestore, siga UMA das opcoes:',
        '1. Baixe a chave privada no Console Firebase (Configuracoes > Contas de servico > Gerar nova chave privada)',
        '2. Salve o arquivo como "service-account.json" dentro da pasta "print-agent/"',
        '   OU defina a variavel de ambiente: GOOGLE_APPLICATION_CREDENTIALS=caminho/para/service-account.json',
        '========================================================================'
      ].join('\n');

      logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  const app = getApp();
  const databaseId = resolveDatabaseId();

  logger.info(`[FIREBASE] Conectando ao Firestore com ID de Banco: "${databaseId}"`);
  firestoreInstance = getFirestore(app, databaseId);

  return firestoreInstance;
}
