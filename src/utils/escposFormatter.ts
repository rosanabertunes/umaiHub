import { Order, OrderItem } from '../types';

/**
 * Utilitário ultraleve de formatação ESC/POS para impressoras térmicas (Epson, Elgin, Bematech, POS-58/80)
 * Totalmente livre de dependências externas e processamento pesado.
 */

// Comandos ESC/POS padrão
export const ESC = '\x1B';
export const GS = '\x1D';

export const COMMANDS = {
  INIT: `${ESC}@`, // Reset / Inicializa
  ALIGN_LEFT: `${ESC}a\x00`,
  ALIGN_CENTER: `${ESC}a\x01`,
  ALIGN_RIGHT: `${ESC}a\x02`,
  BOLD_ON: `${ESC}E\x01`,
  BOLD_OFF: `${ESC}E\x00`,
  DOUBLE_ON: `${GS}!\x11`, // Altura e largura duplas
  DOUBLE_HEIGHT: `${GS}!\x01`,
  NORMAL_TEXT: `${GS}!\x00`,
  CUT_FULL: `${GS}V\x00`, // Corte total
  CUT_PARTIAL: `${GS}V\x42\x00`, // Corte parcial
  FEED_LINES: (n: number) => `${ESC}d${String.fromCharCode(n)}`,
};

// Remove acentos para compatibilidade universal com qualquer firmware de impressora
export function cleanText(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E\n\r]/g, '');
}

// Alinha esquerda e direita na mesma linha (48 colunas padrão 80mm ou 32 colunas 58mm)
export function formatRow(left: string, right: string, width = 48): string {
  const cleanLeft = cleanText(left);
  const cleanRight = cleanText(right);
  const spaceLength = width - cleanLeft.length - cleanRight.length;
  if (spaceLength <= 0) {
    return `${cleanLeft.slice(0, width - cleanRight.length - 1)} ${cleanRight}\n`;
  }
  return `${cleanLeft}${' '.repeat(spaceLength)}${cleanRight}\n`;
}

export function formatSeparator(width = 48, char = '-'): string {
  return `${char.repeat(width)}\n`;
}

/**
 * Gera o buffer ESC/POS para FECHAMENTO DE CONTA / PRÉ-CONTA
 */
export function buildReceiptEscPos(
  order: Order,
  options?: { isFinal?: boolean; restaurantName?: string }
): Uint8Array {
  const restaurantName = options?.restaurantName || 'UMAI SUSHI';
  const width = 48;
  let receipt = '';

  receipt += COMMANDS.INIT;
  receipt += COMMANDS.ALIGN_CENTER;
  receipt += COMMANDS.DOUBLE_ON;
  receipt += `${cleanText(restaurantName)}\n`;
  receipt += COMMANDS.NORMAL_TEXT;
  receipt += `CULINARIA JAPONESA TRADICIONAL\n`;
  receipt += `${options?.isFinal ? '*** CUPOM NAO FISCAL ***' : '*** CONFERENCIA DE MESA ***'}\n`;
  receipt += formatSeparator(width, '=');

  receipt += COMMANDS.ALIGN_LEFT;
  receipt += formatRow(`COMANDA / IDENTIFICADOR:`, order.code, width);
  receipt += formatRow(`TIPO:`, order.type.toUpperCase(), width);
  if (order.customerName) {
    receipt += formatRow(`CLIENTE:`, order.customerName, width);
  }
  if (order.waiterName) {
    receipt += formatRow(`ATENDENTE:`, order.waiterName, width);
  }
  receipt += formatRow(`DATA/HORA:`, new Date().toLocaleString('pt-BR'), width);
  receipt += formatSeparator(width, '-');

  // Modo Rodízio com Adultos e Crianças e verificação de PIX
  let subtotal = 0;
  const isPix = order.paymentMethod === 'PIX';

  if (order.isRodizio) {
    const adultUnitPrice = isPix ? (order.adultPixPrice ?? 79.9) : (order.adultPrice ?? 85.0);
    const childUnitPrice = isPix ? (order.childPixPrice ?? 39.9) : (order.childPrice ?? 42.5);

    const adults = order.adultsCount ?? 1;
    const children = order.childrenCount ?? 0;

    const adultsTotal = adults * adultUnitPrice;
    const childrenTotal = children * childUnitPrice;
    const rodizioTotal = adultsTotal + childrenTotal;

    subtotal += rodizioTotal;

    receipt += COMMANDS.BOLD_ON;
    if (isPix) {
      receipt += `[ PROMO PIX ATIVA NO RODIZIO ]\n`;
    }
    if (adults > 0) {
      receipt += formatRow(
        `RODIZIO ADULTO (${adults}x R$ ${adultUnitPrice.toFixed(2)})`,
        `R$ ${adultsTotal.toFixed(2)}`,
        width
      );
    }
    if (children > 0) {
      receipt += formatRow(
        `RODIZIO MEIA/CRIANCA (${children}x R$ ${childUnitPrice.toFixed(2)})`,
        `R$ ${childrenTotal.toFixed(2)}`,
        width
      );
    }
    receipt += COMMANDS.BOLD_OFF;
    receipt += formatSeparator(width, '-');
  }

  // Itens da comanda (Sushis saem como INCLUSO se rodizio, Bebidas/Sobremesas com valor normal)
  receipt += formatRow(`QTD ITEM`, `TOTAL`, width);
  receipt += formatSeparator(width, '-');

  order.items.forEach((item) => {
    const isZero = order.isRodizio && item.isRodizioItem;
    const itemTotal = isZero ? 0 : item.price * item.quantity;
    subtotal += itemTotal;
    const priceStr = isZero ? 'INCLUSO (R$ 0,00)' : `R$ ${itemTotal.toFixed(2)}`;
    const line = `${item.quantity}x ${item.name}`;
    receipt += formatRow(line, priceStr, width);
    if (item.notes) {
      receipt += `   Obs: ${cleanText(item.notes)}\n`;
    }
  });

  receipt += formatSeparator(width, '=');

  // Cálculos de totais
  const serviceCharge = order.hasServiceCharge ? subtotal * 0.1 : 0;
  const discount = order.discount || 0;
  const total = Math.max(0, subtotal + serviceCharge - discount);

  receipt += formatRow(`SUBTOTAL:`, `R$ ${subtotal.toFixed(2)}`, width);
  if (order.hasServiceCharge) {
    receipt += formatRow(`TAXA DE SERVICO (10%):`, `R$ ${serviceCharge.toFixed(2)}`, width);
  }
  if (discount > 0) {
    receipt += formatRow(`DESCONTO EXTRA:`, `- R$ ${discount.toFixed(2)}`, width);
  }

  receipt += COMMANDS.BOLD_ON;
  receipt += COMMANDS.DOUBLE_HEIGHT;
  receipt += formatRow(`TOTAL A PAGAR:`, `R$ ${total.toFixed(2)}`, width);
  receipt += COMMANDS.NORMAL_TEXT;
  receipt += COMMANDS.BOLD_OFF;

  if (order.paymentMethod) {
    receipt += formatRow(`FORMA DE PAGAMENTO:`, order.paymentMethod.toUpperCase(), width);
  }

  receipt += formatSeparator(width, '-');
  receipt += COMMANDS.ALIGN_CENTER;
  receipt += `Obrigado pela preferencia!\nVolte sempre!\n`;
  receipt += COMMANDS.FEED_LINES(3);
  receipt += COMMANDS.CUT_PARTIAL;

  const encoder = new TextEncoder();
  return encoder.encode(receipt);
}

/**
 * Gera o buffer ESC/POS para PEDIDOS DE PRODUÇÃO (COZINHA / BAR / SUSHIBAR)
 */
export function buildKitchenEscPos(
  orderCode: string,
  items: OrderItem[],
  sector: 'COZINHA' | 'BAR' | 'SUSHIBAR' = 'COZINHA'
): Uint8Array {
  const width = 48;
  let text = '';

  text += COMMANDS.INIT;
  text += COMMANDS.ALIGN_CENTER;
  text += COMMANDS.DOUBLE_ON;
  text += `*** ${sector} ***\n`;
  text += `PEDIDO: ${cleanText(orderCode)}\n`;
  text += COMMANDS.NORMAL_TEXT;
  text += `HORA: ${new Date().toLocaleTimeString('pt-BR')}\n`;
  text += formatSeparator(width, '=');

  text += COMMANDS.ALIGN_LEFT;
  text += COMMANDS.BOLD_ON;

  items.forEach((item) => {
    text += COMMANDS.DOUBLE_HEIGHT;
    text += `${item.quantity}x ${cleanText(item.name)}\n`;
    text += COMMANDS.NORMAL_TEXT;
    if (item.notes) {
      text += `   --> OBS: ${cleanText(item.notes)}\n`;
    }
    text += formatSeparator(width, '.');
  });

  text += COMMANDS.BOLD_OFF;
  text += COMMANDS.FEED_LINES(4);
  text += COMMANDS.CUT_PARTIAL;

  const encoder = new TextEncoder();
  return encoder.encode(text);
}
