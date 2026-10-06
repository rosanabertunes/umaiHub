export const logger = {
  info: (msg: string) => {
    console.log(`[PRINT AGENT] [INFO] ${msg}`);
  },
  ok: (msg: string) => {
    console.log(`[PRINT AGENT] [OK] ${msg}`);
  },
  warn: (msg: string) => {
    console.warn(`[PRINT AGENT] [AVISO] ${msg}`);
  },
  error: (msg: string, detail?: unknown) => {
    console.error(`[PRINT AGENT] [ERRO] ${msg}`);
    if (detail) {
      if (detail instanceof Error) {
        console.error(`              └─ Detalhe: ${detail.message}`);
      } else {
        console.error(`              └─ Detalhe:`, detail);
      }
    }
  },
  debug: (msg: string, data?: unknown) => {
    console.log(`[PRINT AGENT] [DEBUG] ${msg}`, data ? JSON.stringify(data) : '');
  }
};
