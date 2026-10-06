import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { cleanCPF, formatCPF } from '../utils/cpfValidator';

export const UMAI_RESTAURANT_INFO = {
  name: 'UMAI SUSHI',
  subtitle: 'RESTAURANTE E SUSHIBAR',
  cnpj: '', // Definido pelo estabelecimento nas configurações se desejado
  address: '',
  phone: '',
  documentNotice: 'CONTROLE INTERNO — SEM VALOR FISCAL',
};

export interface ReceiptItem {
  code?: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  discount?: number;
  addition?: number;
  isAlaCarteExtra?: boolean;
  isRodizioIncluded?: boolean;
}

export interface NonFiscalReceipt {
  id: string;
  documentType: 'NON_FISCAL_RECEIPT';
  fiscalStatus: 'NOT_APPLICABLE';
  customerName: string | null;
  customerCpf: string | null;
  receiptNumber: string; // Ex: "VENDA Nº 00124"
  receiptIssuedAt: string; // ISO 8601
  receiptVersion: 1;
  restaurantId: string;
  orderIdentifier: string;
  orderType: string;
  items: ReceiptItem[];
  financial: {
    subtotal: number;
    serviceTax: number;
    discount: number;
    total: number;
    paymentMethod: string;
    rodizioTotal: number;
    itemsTotal: number;
    rodizioAdults: number;
    rodizioKids: number;
    adultPrice: number;
    kidPrice: number;
  };
  restaurantInfo: typeof UMAI_RESTAURANT_INFO;
  syncedToFirestore?: boolean;
}

const LOCAL_STORAGE_KEY = 'umai_sushi_non_fiscal_receipts';
const LAST_RECEIPT_SEQ_KEY = 'umai_sushi_receipt_sequence';

/**
 * Gera o próximo número sequencial de VENDA Nº
 */
export function getNextReceiptNumber(): string {
  try {
    const saved = localStorage.getItem(LAST_RECEIPT_SEQ_KEY);
    let seq = saved ? parseInt(saved, 10) : 100;
    if (isNaN(seq) || seq <= 0) seq = 100;
    seq += 1;
    localStorage.setItem(LAST_RECEIPT_SEQ_KEY, String(seq));
    return `VENDA Nº ${String(seq).padStart(5, '0')}`;
  } catch {
    const fallback = Math.floor(1000 + Math.random() * 9000);
    return `VENDA Nº ${fallback}`;
  }
}

/**
 * Salva no cache local (localStorage) para persistência offline infalível
 */
export function saveToLocalReceipts(receipt: NonFiscalReceipt): void {
  try {
    const existing = getLocalReceipts();
    const index = existing.findIndex((r) => r.id === receipt.id);
    if (index >= 0) {
      existing[index] = receipt;
    } else {
      existing.unshift(receipt);
    }
    // Mantém os últimos 150 comprovantes para histórico
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(existing.slice(0, 150)));
  } catch (e) {
    console.warn('Falha ao gravar comprovante no localStorage:', e);
  }
}

export function getLocalReceipts(): NonFiscalReceipt[] {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

/**
 * Salva o cupom no Firestore com suporte offline nativo.
 * Se estiver offline, grava no cache IndexedDB do SDK e sincroniza ao reconectar
 * sem duplicar ou criar outra venda.
 */
export async function persistNonFiscalReceipt(
  receipt: NonFiscalReceipt
): Promise<{ success: boolean; error?: string }> {
  // Salva no armazenamento do navegador de imediato
  saveToLocalReceipts(receipt);

  try {
    const receiptRef = doc(db, `restaurants/${receipt.restaurantId}/receipts/${receipt.id}`);
    await setDoc(receiptRef, {
      ...receipt,
      _serverTimestamp: serverTimestamp(),
    }, { merge: true });

    return { success: true };
  } catch (err: any) {
    // Erros de rede ou offline não interrompem o fluxo do PDV
    console.warn('Registro em cache offline Firestore (será sincronizado quando houver internet):', err?.message || err);
    return { success: true };
  }
}

/**
 * Formata os dados de identificação do consumidor seguindo as regras estritas:
 * - Nome preenchido: CLIENTE: [nome];
 * - CPF preenchido: CPF: [CPF formatado];
 * - Ambos vazios: CONSUMIDOR NÃO IDENTIFICADO.
 */
export function getConsumerIdentification(
  customerName: string | null | undefined,
  customerCpf: string | null | undefined
): string[] {
  const nameTrim = (customerName || '').trim();
  const cpfDigits = cleanCPF(customerCpf || '');

  const lines: string[] = [];

  if (nameTrim) {
    lines.push(`CLIENTE: ${nameTrim}`);
  }
  if (cpfDigits.length === 11) {
    lines.push(`CPF: ${formatCPF(cpfDigits)}`);
  }

  if (lines.length === 0) {
    lines.push('CONSUMIDOR NÃO IDENTIFICADO');
  }

  return lines;
}

/**
 * Monta o texto puro de 48 colunas (72mm / 80mm térmico) do Cupom Não Fiscal
 */
export function buildThermalReceiptText(receipt: NonFiscalReceipt): string {
  const width = 48;
  const sep = '='.repeat(width);
  const dashed = '-'.repeat(width);

  const padRow = (left: string, right: string) => {
    const space = width - left.length - right.length;
    if (space <= 0) return `${left.slice(0, width - right.length - 1)} ${right}\n`;
    return `${left}${' '.repeat(space)}${right}\n`;
  };

  const center = (text: string) => {
    const pad = Math.max(0, Math.floor((width - text.length) / 2));
    return `${' '.repeat(pad)}${text}\n`;
  };

  let out = '';

  // Cabeçalho Umai Sushi
  out += `${sep}\n`;
  out += center(receipt.restaurantInfo.name);
  if (receipt.restaurantInfo.subtitle) out += center(receipt.restaurantInfo.subtitle);
  if (receipt.restaurantInfo.cnpj) out += center(`CNPJ: ${receipt.restaurantInfo.cnpj}`);
  if (receipt.restaurantInfo.address) out += center(receipt.restaurantInfo.address);
  if (receipt.restaurantInfo.phone) out += center(`Tel: ${receipt.restaurantInfo.phone}`);
  out += `${sep}\n`;

  // Identificação do Cupom Não Fiscal
  out += center('CUPOM NÃO FISCAL — AMOSTRA');
  out += center('CONTROLE INTERNO');
  out += center('SEM VALOR FISCAL');
  out += `${dashed}\n`;

  // Dados da Venda
  out += padRow(receipt.receiptNumber, '');
  const dateFormatted = new Date(receipt.receiptIssuedAt).toLocaleString('pt-BR');
  out += padRow('DATA/HORA:', dateFormatted);
  out += padRow('IDENTIFICADOR:', `${receipt.orderIdentifier} (${receipt.orderType})`);
  out += `${dashed}\n`;

  // Identificação do Consumidor
  out += 'IDENTIFICAÇÃO DO CONSUMIDOR:\n';
  const consumerLines = getConsumerIdentification(receipt.customerName, receipt.customerCpf);
  consumerLines.forEach((line) => {
    out += `  ${line}\n`;
  });
  out += `${dashed}\n`;

  // Itens do Pedido
  out += padRow('COD  DESCRIÇÃO           QTD UN  V.UNIT', 'TOTAL');
  out += `${dashed}\n`;

  // Rodízio (se houver)
  if (receipt.financial.rodizioTotal > 0) {
    out += `[ MODO RODÍZIO ]\n`;
    if (receipt.financial.rodizioAdults > 0) {
      const lineLeft = `RODÍZIO ADULTO (${receipt.financial.rodizioAdults}x R$ ${receipt.financial.adultPrice.toFixed(2)})`;
      const lineRight = `R$ ${(receipt.financial.rodizioAdults * receipt.financial.adultPrice).toFixed(2)}`;
      out += padRow(lineLeft, lineRight);
    }
    if (receipt.financial.rodizioKids > 0) {
      const lineLeft = `RODÍZIO CRIANÇA (${receipt.financial.rodizioKids}x R$ ${receipt.financial.kidPrice.toFixed(2)})`;
      const lineRight = `R$ ${(receipt.financial.rodizioKids * receipt.financial.kidPrice).toFixed(2)}`;
      out += padRow(lineLeft, lineRight);
    }
    out += `${dashed}\n`;
  }

  // Itens faturados e consumidos
  if (receipt.items.length === 0 && receipt.financial.rodizioTotal === 0) {
    out += padRow('Nenhum item lançado', 'R$ 0,00');
  } else {
    receipt.items.forEach((it, idx) => {
      const code = it.code || String(idx + 1).padStart(3, '0');
      const unit = it.unit || 'UN';
      const isZero = it.totalPrice === 0 || it.isRodizioIncluded;
      const totalStr = isZero ? 'INCLUSO' : `R$ ${it.totalPrice.toFixed(2)}`;

      const desc = `${code} ${it.name}${it.isAlaCarteExtra ? ' (À la Carte)' : ''}`;
      out += `${desc.slice(0, width)}\n`;
      const detail = `    ${it.quantity} ${unit} x R$ ${it.unitPrice.toFixed(2)}`;
      out += padRow(detail, totalStr);
    });
  }

  out += `${dashed}\n`;

  // Totais e Pagamento
  out += padRow('SUBTOTAL:', `R$ ${receipt.financial.subtotal.toFixed(2)}`);
  if (receipt.financial.serviceTax > 0) {
    out += padRow('TAXA DE SERVIÇO (10%):', `R$ ${receipt.financial.serviceTax.toFixed(2)}`);
  }
  if (receipt.financial.discount > 0) {
    out += padRow('DESCONTO:', `- R$ ${receipt.financial.discount.toFixed(2)}`);
  }

  out += `${sep}\n`;
  out += padRow('TOTAL A PAGAR:', `R$ ${receipt.financial.total.toFixed(2)}`);
  out += padRow('FORMA DE PAGAMENTO:', receipt.financial.paymentMethod.toUpperCase());
  out += padRow('VALOR PAGO:', `R$ ${receipt.financial.total.toFixed(2)}`);
  out += `${sep}\n`;

  out += center('Obrigado pela preferência!');
  out += center('Volte sempre ao Umai Sushi!');
  out += `${sep}\n`;

  return out;
}
