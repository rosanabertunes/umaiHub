import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrinterConfig } from './types.js';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// O config.json fica na raiz de print-agent/
const configPath = path.resolve(__dirname, '../../config.json');

const DEFAULT_CONFIG: PrinterConfig = {
  printerName: 'EPSON TM-T20X Receipt',
  paperWidth: 48,
  autoCut: true,
  debug: false,
  restaurantId: 'umai-sushi',
  printerRole: 'TODOS',
  printerRoles: ['CAIXA', 'COZINHA', 'SUSHIBAR'],
  firestoreDatabaseId: 'ai-studio-0e2830d4-527a-49d2-a0f7-899d71a25e1c',
  pollingOrListener: true,
  serviceAccountPath: 'service-account.json'
};

function findConfigFile(): string | null {
  const candidates = [
    path.resolve(process.cwd(), 'config.json'),
    path.resolve(process.cwd(), 'print-agent/config.json'),
    path.resolve(__dirname, '../config.json'),
    path.resolve(__dirname, '../../config.json'),
    path.resolve(__dirname, 'config.json')
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function loadConfig(): PrinterConfig {
  const foundPath = findConfigFile();
  if (foundPath) {
    try {
      const raw = fs.readFileSync(foundPath, 'utf-8');
      const parsed = JSON.parse(raw);

      let roles: string[] = ['CAIXA', 'COZINHA', 'SUSHIBAR'];
      if (Array.isArray(parsed.printerRoles) && parsed.printerRoles.length > 0) {
        roles = parsed.printerRoles.map((r: string) => String(r).trim().toUpperCase());
      } else if (typeof parsed.printerRole === 'string' && parsed.printerRole.trim()) {
        const single = parsed.printerRole.trim().toUpperCase();
        if (single === 'TODOS' || single === 'ALL') {
          roles = ['CAIXA', 'COZINHA', 'SUSHIBAR'];
        } else {
          roles = [single];
        }
      }

      return {
        printerName: parsed.printerName?.trim() || DEFAULT_CONFIG.printerName,
        paperWidth: typeof parsed.paperWidth === 'number' ? parsed.paperWidth : DEFAULT_CONFIG.paperWidth,
        autoCut: parsed.autoCut !== undefined ? Boolean(parsed.autoCut) : DEFAULT_CONFIG.autoCut,
        debug: parsed.debug !== undefined ? Boolean(parsed.debug) : DEFAULT_CONFIG.debug,
        restaurantId: parsed.restaurantId?.trim() || DEFAULT_CONFIG.restaurantId,
        printerRole: parsed.printerRole?.trim() || (roles.length === 1 ? roles[0] : 'TODOS'),
        printerRoles: roles,
        firestoreDatabaseId: parsed.firestoreDatabaseId?.trim() || parsed.databaseId?.trim() || DEFAULT_CONFIG.firestoreDatabaseId,
        pollingOrListener: parsed.pollingOrListener !== undefined ? Boolean(parsed.pollingOrListener) : DEFAULT_CONFIG.pollingOrListener,
        serviceAccountPath: parsed.serviceAccountPath?.trim() || DEFAULT_CONFIG.serviceAccountPath
      };
    } catch (err) {
      logger.warn(`Falha ao ler config.json em ${foundPath}. Usando valores padrão.`);
    }
  }

  return DEFAULT_CONFIG;
}
