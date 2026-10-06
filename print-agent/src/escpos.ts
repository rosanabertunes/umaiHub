/**
 * Utilitário ESC/POS para Epson TM-T20X e impressoras térmicas padrão
 * Gera buffers binários nativos sem dependências externas.
 */

import { PrintJob } from './types.js';

export const ESC = '\x1B';
export const GS = '\x1D';

export const COMMANDS = {
  INIT: `${ESC}@`,
  ALIGN_LEFT: `${ESC}a\x00`,
  ALIGN_CENTER: `${ESC}a\x01`,
  ALIGN_RIGHT: `${ESC}a\x02`,
  BOLD_ON: `${ESC}E\x01`,
  BOLD_OFF: `${ESC}E\x00`,
  DOUBLE_ON: `${GS}!\x11`,
  NORMAL_TEXT: `${GS}!\x00`,
  FEED_LINES: (n: number) => `${ESC}d${String.fromCharCode(n)}`,
  CUT_PARTIAL: `${GS}V\x42\x00`,
  CUT_FULL: `${GS}V\x00`,
};

export function cleanText(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E\n\r]/g, '');
}

export function formatRow(left: string, right: string, width = 48): string {
  const cleanLeft = cleanText(left);
  const cleanRight = cleanText(right);
  const spaceLength = width - cleanLeft.length - cleanRight.length;
  if (spaceLength <= 0) {
    return `${cleanLeft.slice(0, width - cleanRight.length - 1)} ${cleanRight}\n`;
  }
  return `${cleanLeft}${' '.repeat(spaceLength)}${cleanRight}\n`;
}

export function formatSeparator(width = 48, char = '='): string {
  return `${char.repeat(width)}\n`;
}

/**
 * Converte um PrintJob do Firestore em Buffer binário ESC/POS (80mm / 72mm imprimíveis)
 * Suporta tanto cupons de caixa (venda / pré-conta) quanto tickets de produção (Cozinha e Sushibar).
 */
export function formatPrintJobReceipt(job: PrintJob, width = 48, autoCut = true): Buffer {
  let text = '';
  const content = typeof job.content === 'object' && job.content !== null ? job.content : {};
  const role = (job.printerRole || '').toUpperCase();
  const isProduction = role === 'SUSHIBAR' || role === 'COZINHA' || String(job.title || '').toUpperCase().includes('PRODUCAO') || content.documentType === 'KITCHEN_ORDER';

  // =========================================================================
  // FORMATO 1: TICKET DE PRODUÇÃO (SUSHIBAR / COZINHA)
  // =========================================================================
  if (isProduction) {
    const sectorName = role === 'SUSHIBAR' ? 'SUSHIBAR' : (role === 'COZINHA' ? 'COZINHA' : 'PRODUCAO');
    text += COMMANDS.INIT;
    text += COMMANDS.ALIGN_CENTER;
    text += formatSeparator(width, '=');
    text += COMMANDS.DOUBLE_ON;
    text += `*** PEDIDO DE PRODUCAO ***\n`;
    text += `SETOR: ${sectorName}\n`;
    text += COMMANDS.NORMAL_TEXT;
    text += formatSeparator(width, '=');

    text += COMMANDS.ALIGN_LEFT;
    text += COMMANDS.BOLD_ON;
    text += formatRow('COMANDA / IDENTIFICADOR:', `${cleanText(content.orderIdentifier || 'Mesa')} (${cleanText(content.orderType || 'Mesa')})`, width);
    text += COMMANDS.BOLD_OFF;

    const dateStr = job.createdAt && typeof (job.createdAt as any).toDate === 'function'
      ? (job.createdAt as any).toDate().toLocaleString('pt-BR')
      : new Date().toLocaleString('pt-BR');
    text += formatRow('DATA/HORA:', dateStr, width);
    text += formatRow('ID TRABALHO:', job.id.slice(-8), width);
    text += formatSeparator(width, '-');

    text += COMMANDS.BOLD_ON;
    text += formatRow('QTD   ITEM / DESCRICAO', 'OBS', width);
    text += COMMANDS.BOLD_OFF;
    text += formatSeparator(width, '-');

    if (Array.isArray(content.items) && content.items.length > 0) {
      for (const item of content.items) {
        text += COMMANDS.BOLD_ON;
        text += COMMANDS.DOUBLE_ON;
        text += `[ ${item.quantity || 1}x ] ${cleanText(item.name || 'Item')}\n`;
        text += COMMANDS.NORMAL_TEXT;
        text += COMMANDS.BOLD_OFF;
        if (item.category || item.isAlaCarteExtra || item.isRodizioIncluded) {
          const obs = item.isAlaCarteExtra ? '(A la Carte)' : (item.isRodizioIncluded ? '(Rodizio)' : `(${item.category || ''})`);
          text += `      Obs: ${obs}\n`;
        }
      }
    } else if (content.rawText) {
      text += `${content.rawText}\n`;
    }

    text += formatSeparator(width, '=');
    text += COMMANDS.ALIGN_CENTER;
    text += `[ FIM DO PEDIDO - ${sectorName} ]\n`;
    text += COMMANDS.FEED_LINES(4);
    if (autoCut) {
      text += COMMANDS.CUT_PARTIAL;
    }
    return Buffer.from(text, 'binary');
  }

  // =========================================================================
  // FORMATO 2: CUPOM DE CAIXA (PRÉ-CONTA OU FECHAMENTO NÃO FISCAL)
  // =========================================================================
  text += COMMANDS.INIT;
  text += COMMANDS.ALIGN_CENTER;
  text += formatSeparator(width, '=');
  text += COMMANDS.DOUBLE_ON;
  text += 'UMAI SUSHI\n';
  text += COMMANDS.NORMAL_TEXT;
  text += 'CULINARIA JAPONESA CONTEMPORANEA\n';
  text += formatSeparator(width, '=');

  const isConference = Boolean(content.isConference);

  text += COMMANDS.BOLD_ON;
  if (isConference) {
    text += 'CONFERENCIA DE MESA (PRE-CONTA)\n';
    text += 'NAO E DOCUMENTO FISCAL\n';
  } else {
    text += 'CUPOM NAO FISCAL\n';
    text += 'COMPROVANTE DE VENDA\n';
    text += 'SEM VALOR FISCAL\n';
  }
  text += COMMANDS.BOLD_OFF;
  text += formatSeparator(width, '-');

  text += COMMANDS.ALIGN_LEFT;
  
  // Número da Venda (Somente VENDA Nº)
  const receiptNum = content.receiptNumber || `VENDA No ${job.id.slice(-6)}`;
  text += formatRow(cleanText(receiptNum), '', width);

  const dateStr = job.createdAt && typeof (job.createdAt as any).toDate === 'function'
    ? (job.createdAt as any).toDate().toLocaleString('pt-BR')
    : new Date().toLocaleString('pt-BR');

  text += formatRow('DATA/HORA:', dateStr, width);
  text += formatRow('IDENTIFICADOR:', `${cleanText(content.orderIdentifier || 'Mesa')} (${cleanText(content.orderType || 'Mesa')})`, width);
  text += formatSeparator(width, '-');

  // Identificação do Consumidor
  text += 'IDENTIFICACAO DO CONSUMIDOR:\n';
  const cName = (content.customerName || '').trim();
  const cCpf = (content.customerCpf || '').trim();

  if (cName) {
    text += `  CLIENTE: ${cleanText(cName)}\n`;
  }
  if (cCpf) {
    text += `  CPF: ${cleanText(cCpf)}\n`;
  }
  if (!cName && !cCpf) {
    text += '  CONSUMIDOR NAO IDENTIFICADO\n';
  }
  text += formatSeparator(width, '-');

  // Detalhe Financeiro e Rodízio
  const fin = content.financial;
  if (fin) {
    if (fin.rodizioTotal > 0) {
      text += COMMANDS.BOLD_ON;
      text += `[ MODO RODIZIO ]\n`;
      if (fin.rodizioAdults && fin.rodizioAdults > 0) {
        text += formatRow(
          `Adultos (${fin.rodizioAdults}x R$ ${fin.adultPrice.toFixed(2)})`,
          `R$ ${(fin.rodizioAdults * fin.adultPrice).toFixed(2)}`,
          width
        );
      }
      if (fin.rodizioKids && fin.rodizioKids > 0) {
        text += formatRow(
          `Criancas (${fin.rodizioKids}x R$ ${fin.kidPrice.toFixed(2)})`,
          `R$ ${(fin.rodizioKids * fin.kidPrice).toFixed(2)}`,
          width
        );
      }
      text += COMMANDS.BOLD_OFF;
      text += formatSeparator(width, '-');
    }
  }

  // Itens reais da comanda
  if (Array.isArray(content.items) && content.items.length > 0) {
    text += formatRow('COD  DESCRIÇÃO            QTD UN', 'TOTAL', width);
    text += formatSeparator(width, '-');
    for (let i = 0; i < content.items.length; i++) {
      const item = content.items[i];
      const code = item.code || String(i + 1).padStart(3, '0');
      const unit = item.unit || 'UN';
      const itemLine = `${code} ${cleanText(item.name || 'Item')}${item.isAlaCarteExtra ? ' (A la Carte)' : ''}`;
      const isZero = item.price === 0 || item.isRodizioIncluded;
      const totalItem = isZero ? 0 : Number(item.price * (item.quantity || 1));
      const priceStr = isZero ? 'INCLUSO' : `R$ ${totalItem.toFixed(2)}`;

      text += `${itemLine.slice(0, width)}\n`;
      const detailLine = `    ${item.quantity || 1} ${unit} x R$ ${(item.price || 0).toFixed(2)}`;
      text += formatRow(detailLine, priceStr, width);
    }
  }

  // Totais e Pagamento
  if (fin) {
    text += formatSeparator(width, '=');
    text += formatRow('SUBTOTAL:', `R$ ${fin.subtotal.toFixed(2)}`, width);
    if (fin.serviceTax > 0) {
      text += formatRow('TAXA DE SERVICO (10%):', `R$ ${fin.serviceTax.toFixed(2)}`, width);
    }
    if (fin.discount && fin.discount > 0) {
      text += formatRow('DESCONTO:', `- R$ ${fin.discount.toFixed(2)}`, width);
    }
    text += COMMANDS.BOLD_ON;
    text += COMMANDS.DOUBLE_ON;
    text += formatRow('TOTAL:', `R$ ${fin.total.toFixed(2)}`, width);
    text += COMMANDS.NORMAL_TEXT;
    text += COMMANDS.BOLD_OFF;

    if (fin.paymentMethod) {
      text += formatRow('FORMA DE PAGAMENTO:', cleanText(fin.paymentMethod).toUpperCase(), width);
      text += formatRow('VALOR PAGO:', `R$ ${fin.total.toFixed(2)}`, width);
    }
  }

  text += formatSeparator(width, '=');
  text += COMMANDS.ALIGN_CENTER;
  text += 'Obrigado pela preferencia!\nVolte sempre ao Umai Sushi!\n';

  text += COMMANDS.FEED_LINES(4);
  if (autoCut) {
    text += COMMANDS.CUT_PARTIAL;
  }

  return Buffer.from(text, 'binary');
}

/**
 * Constrói o cupom de teste para validação física da Epson TM-T20X
 */
export function buildTestReceipt(options?: {
  restaurantName?: string;
  printerName?: string;
  width?: number;
}): Buffer {
  const restaurantName = options?.restaurantName || 'UMAI SUSHI';
  const printerName = options?.printerName || 'Epson TM-T20X';
  const width = options?.width || 48;

  let text = '';

  // 1. Inicializa o buffer da impressora
  text += COMMANDS.INIT;

  // 2. Cabeçalho Centralizado
  text += COMMANDS.ALIGN_CENTER;
  text += formatSeparator(width, '=');
  text += COMMANDS.DOUBLE_ON;
  text += `${cleanText(restaurantName)}\n`;
  text += COMMANDS.NORMAL_TEXT;
  text += COMMANDS.BOLD_ON;
  text += `TESTE DE IMPRESSAO\n`;
  text += `PRINT AGENT ONLINE\n`;
  text += COMMANDS.BOLD_OFF;
  text += formatSeparator(width, '=');

  // 3. Informações Técnicas Alinhadas
  text += COMMANDS.ALIGN_LEFT;
  text += formatRow('Data/Hora:', new Date().toLocaleString('pt-BR'), width);
  text += formatRow('Sistema:', 'Windows Spooler (RAW)', width);
  text += formatRow('Impressora:', printerName, width);
  text += formatRow('Largura Papel:', `${width} colunas (80mm)`, width);
  text += formatSeparator(width, '-');

  // 4. Detalhes da Transmissao
  text += `Origem: Processo Node.js Autonomo\n`;
  text += `Canal: Windows Spooler (Win32 P/Invoke)\n`;
  text += `Formato: Buffer Binario ESC/POS Puro\n`;
  text += `Datatype: RAW (Sem conversao grafica GDI)\n`;
  text += formatSeparator(width, '=');

  // 5. Validacao Fisica
  text += COMMANDS.ALIGN_CENTER;
  text += `TESTE DE TRANSMISSAO FISICA RAW\n`;
  text += `Se este cupom imprimiu e cortou o papel,\n`;
  text += `o elo PC -> Windows -> Epson esta aprovado.\n`;
  text += `Umai Sushi - Sistema PDV\n`;

  // 6. Avanço de papel e Corte
  text += COMMANDS.FEED_LINES(4);
  text += COMMANDS.CUT_PARTIAL;

  return Buffer.from(text, 'binary');
}
