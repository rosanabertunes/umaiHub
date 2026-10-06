import { db } from '../lib/firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc,
  serverTimestamp, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  limit 
} from 'firebase/firestore';

export interface PrintJobPayload {
  jobId?: string;
  idempotencyKey?: string;
  isRePrint?: boolean;
  originalJobId?: string;
  copyNumber?: number;
  restaurantId?: string;
  printerRole: 'CAIXA' | 'SUSHIBAR' | 'COZINHA';
  printerName?: string;
  title: string;
  orderIdentifier: string;
  orderType: string;
  isConference?: boolean; // Se é conferência de mesa (pré-conta) ou fechamento
  customerName?: string | null;
  customerCpf?: string | null;
  receiptNumber?: string; // Ex: "VENDA Nº 00124"
  documentType?: 'NON_FISCAL_RECEIPT' | 'KITCHEN_ORDER';
  fiscalStatus?: 'NOT_APPLICABLE';
  receiptVersion?: 1;
  financial?: {
    subtotal: number;
    rodizioTotal: number;
    itemsTotal: number;
    serviceTax: number;
    discount?: number;
    total: number;
    paymentMethod: string;
    adultPrice: number;
    kidPrice: number;
    rodizioAdults?: number;
    rodizioKids?: number;
  };
  rawText?: string;
  items?: Array<{
    code?: string;
    name: string;
    quantity: number;
    unit?: string;
    price: number;
    category?: string;
    isAlaCarteExtra?: boolean;
    isRodizioIncluded?: boolean;
    notes?: string;
  }>;
}

export const DEFAULT_RESTAURANT_ID = 'umai-sushi';

// Registro de jobs em voo para impedir duplo clique local imediato
const inFlightJobs = new Map<string, Promise<{ success: boolean; jobId: string; alreadyProcessed?: boolean; error?: string }>>();

/**
 * Remove recursivamente propriedades com valor 'undefined' de objetos e arrays,
 * preservando tipos especiais do Firestore (FieldValue, Timestamp, Date),
 * zeros legítimos (0), booleanos (false) e strings vazias ("").
 */
export function sanitizeFirestoreData(val: any): any {
  if (val === undefined) return null;
  if (val === null || typeof val !== 'object') return val;

  // Preserva instâncias de Date e FieldValue / Timestamp
  if (
    val instanceof Date || 
    (val.constructor && (val.constructor.name === 'FieldValue' || val.constructor.name === 'Timestamp')) ||
    ('_methodName' in val)
  ) {
    return val;
  }

  if (Array.isArray(val)) {
    return val
      .filter((item) => item !== undefined)
      .map(sanitizeFirestoreData);
  }

  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(val)) {
    if (v !== undefined) {
      clean[k] = sanitizeFirestoreData(v);
    }
  }
  return clean;
}

/**
 * Envia um job de impressão para a fila do Cloud Firestore de forma idempotente e segura.
 * - Produção (KITCHEN_ORDER): omite estritamente o bloco 'financial'
 * - Conferência/Cupom (NON_FISCAL_RECEIPT): valida e exige 'financial' preenchido
 */
export async function sendPrintJob(payload: PrintJobPayload): Promise<{ 
  success: boolean; 
  jobId: string; 
  alreadyProcessed?: boolean;
  error?: string;
}> {
  const restaurantId = payload.restaurantId || DEFAULT_RESTAURANT_ID;
  const isRePrint = Boolean(payload.isRePrint);
  const isConf = Boolean(payload.isConference);
  const isKitchen = payload.printerRole === 'SUSHIBAR' || payload.printerRole === 'COZINHA' || payload.documentType === 'KITCHEN_ORDER';
  const docType = payload.documentType || (isKitchen ? 'KITCHEN_ORDER' : 'NON_FISCAL_RECEIPT');

  // Chave determinística de idempotência (SEM Date.now aleatório)
  const keyBase = payload.idempotencyKey || `${payload.orderIdentifier}-${isConf ? 'conf' : (isKitchen ? 'prod' : 'close')}`;

  let jobId = payload.jobId;
  if (!jobId) {
    if (isRePrint) {
      const copyNum = payload.copyNumber || 2;
      jobId = `job-${keyBase}-reprint-${copyNum}`;
    } else {
      jobId = `job-${keyBase}`;
    }
  }

  // Previne duplicação concorrente por duplo clique no mesmo milissegundo
  if (inFlightJobs.has(jobId)) {
    console.warn(`[PRINT JOB BLOQUEIO CONCORRENTE] Job ID "${jobId}" já está sendo transmitido.`);
    return inFlightJobs.get(jobId)!;
  }

  const sendPromise = (async () => {
    try {
      const jobRef = doc(db, `restaurants/${restaurantId}/printJobs/${jobId}`);

      // 1. Verifica se o job já existe no Firestore para evitar reimpressões involuntárias
      try {
        const existingDoc = await getDoc(jobRef);
        if (existingDoc.exists()) {
          const existingData = existingDoc.data();
          const currentStatus = existingData?.status;

          // Se o job já estiver concluído ou sendo processado, NUNCA redefina como pendente!
          if (currentStatus === 'completed' || currentStatus === 'processing' || currentStatus === 'spooler_sent_uncertain') {
            console.log(`[PRINT JOB IDEMPOTENTE] Job "${jobId}" já foi aceito/processado (status: ${currentStatus}). Ignorando reenvio acidental.`);
            return { success: true, jobId, alreadyProcessed: true };
          }

          // Se já estiver na fila como pendente, apenas confirma que está aguardando
          if (currentStatus === 'pending') {
            console.log(`[PRINT JOB IDEMPOTENTE] Job "${jobId}" já aguarda na fila. Evitando job duplicado.`);
            return { success: true, jobId, alreadyProcessed: true };
          }
        }
      } catch (checkErr) {
        console.warn('Checagem prévia de job no Firestore offline/erro:', checkErr);
      }

      let titleHeader = isKitchen
        ? `PRODUCAO [${payload.printerRole}]`
        : (isConf ? 'CONFERENCIA DE MESA (PRE-CONTA)' : 'CUPOM NAO FISCAL');

      if (isRePrint) {
        titleHeader = `[${payload.copyNumber || 2}a VIA - REIMPRESSAO] ${titleHeader}`;
      }

      // Validação estrita do contrato de payload:
      // Se for conferência ou cupom não fiscal, 'financial' é OBRIGATÓRIO!
      let validatedFinancial: Record<string, any> | undefined = undefined;
      if (!isKitchen) {
        if (!payload.financial) {
          throw new Error('Campo financeiro (financial) é obrigatório para emissão de pré-conta e cupom não fiscal.');
        }
        const f = payload.financial;
        validatedFinancial = {
          subtotal: Number(f.subtotal) || 0,
          rodizioTotal: Number(f.rodizioTotal) || 0,
          itemsTotal: Number(f.itemsTotal) || 0,
          serviceTax: Number(f.serviceTax) || 0,
          total: Number(f.total) || 0,
          paymentMethod: String(f.paymentMethod || 'A Definir'),
          adultPrice: Number(f.adultPrice) || 0,
          kidPrice: Number(f.kidPrice) || 0
        };
        if (typeof f.discount === 'number') validatedFinancial.discount = f.discount;
        if (typeof f.rodizioAdults === 'number') validatedFinancial.rodizioAdults = f.rodizioAdults;
        if (typeof f.rodizioKids === 'number') validatedFinancial.rodizioKids = f.rodizioKids;
      }

      // Constrói os itens sem nenhum campo undefined
      const cleanItems = (payload.items || []).map((i, idx) => {
        const itemObj: Record<string, any> = {
          code: i.code || String(idx + 1).padStart(3, '0'),
          name: i.name,
          quantity: typeof i.quantity === 'number' ? i.quantity : 1,
          unit: i.unit || 'UN',
          price: typeof i.price === 'number' ? i.price : 0,
          category: i.category || 'Geral'
        };
        if (typeof i.isAlaCarteExtra === 'boolean') {
          itemObj.isAlaCarteExtra = i.isAlaCarteExtra;
        }
        if (typeof i.isRodizioIncluded === 'boolean') {
          itemObj.isRodizioIncluded = i.isRodizioIncluded;
        }
        if (typeof i.notes === 'string' && i.notes.trim() !== '') {
          itemObj.notes = i.notes.trim();
        }
        return itemObj;
      });

      // Conteúdo formatado consumido pelo Print Agent
      const contentPayload: Record<string, any> = {
        title: `${titleHeader} - ${payload.orderType.toUpperCase()} ${payload.orderIdentifier}`,
        message: isKitchen 
          ? `Pedido de Produção - ${payload.printerRole}`
          : (isConf ? 'Conferencia de consumo - Nao e comprovante fiscal' : 'Comprovante de Venda - Sem Valor Fiscal'),
        orderIdentifier: payload.orderIdentifier,
        orderType: payload.orderType,
        isConference: Boolean(isConf),
        isRePrint,
        originalJobId: payload.originalJobId || null,
        copyNumber: payload.copyNumber || 1,
        customerName: payload.customerName || null,
        customerCpf: payload.customerCpf || null,
        receiptNumber: payload.receiptNumber || `VENDA No ${jobId.slice(-6)}`,
        documentType: docType,
        fiscalStatus: 'NOT_APPLICABLE',
        receiptVersion: 1,
        items: cleanItems
      };

      // Se for não fiscal / conferência, inclui o bloco financeiro validado.
      // Se for produção (cozinha/sushibar), financial é OMITIDO.
      if (validatedFinancial !== undefined) {
        contentPayload.financial = validatedFinancial;
      }

      if (typeof payload.rawText === 'string') {
        contentPayload.rawText = payload.rawText;
      }

      const jobDoc: Record<string, any> = {
        id: jobId,
        restaurantId,
        printerRole: payload.printerRole,
        printerName: payload.printerName || 'EPSON TM-T20X Receipt',
        title: `${titleHeader} [${payload.orderIdentifier}]`,
        content: contentPayload,
        documentType: docType,
        fiscalStatus: 'NOT_APPLICABLE',
        receiptNumber: contentPayload.receiptNumber,
        customerName: payload.customerName || null,
        customerCpf: payload.customerCpf || null,
        status: 'pending',
        isRePrint,
        originalJobId: payload.originalJobId || null,
        retryCount: 0,
        createdAt: serverTimestamp(),
        timestamp: new Date().toISOString()
      };

      // Garante sanitização completa contra campos undefined
      const sanitizedDoc = sanitizeFirestoreData(jobDoc);

      await setDoc(jobRef, sanitizedDoc);
      console.log(`[PRINT JOB REGISTRADO] Job ID: ${jobId} -> /restaurants/${restaurantId}/printJobs (Setor: ${payload.printerRole})`);
      return { success: true, jobId };
    } catch (err: any) {
      console.error('[ERRO PRINT JOB FIRESTORE]:', err);
      return { success: false, jobId: '', error: err?.message || String(err) };
    } finally {
      setTimeout(() => inFlightJobs.delete(jobId), 2500);
    }
  })();

  inFlightJobs.set(jobId, sendPromise);
  return sendPromise;
}

/**
 * Monitora o status dos últimos print jobs para feedback visual no PDV
 */
export function subscribeToLatestPrintJobs(
  restaurantId: string = DEFAULT_RESTAURANT_ID,
  callback: (jobs: any[]) => void
): () => void {
  try {
    const jobsRef = collection(db, `restaurants/${restaurantId}/printJobs`);
    const q = query(jobsRef, orderBy('timestamp', 'desc'), limit(5));

    return onSnapshot(
      q,
      (snapshot) => {
        const jobs = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        callback(jobs);
      },
      (error) => {
        console.warn('Erro ao escutar print jobs recentes:', error.message);
      }
    );
  } catch {
    return () => {};
  }
}

export type PrintJobLifecycleStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'spooler_sent_uncertain';

export function subscribeToJobStatus(
  jobId: string,
  callback: (job: { status: PrintJobLifecycleStatus; errorMessage?: string } | null) => void,
  restaurantId: string = DEFAULT_RESTAURANT_ID
): () => void {
  try {
    const jobRef = doc(db, `restaurants/${restaurantId}/printJobs/${jobId}`);
    return onSnapshot(
      jobRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          callback(null);
          return;
        }
        const data = snapshot.data();
        callback({
          status: data.status,
          errorMessage: data.errorMessage,
        });
      },
      (error) => {
        console.warn(`Erro ao monitorar job ${jobId}:`, error.message);
      }
    );
  } catch {
    return () => {};
  }
}
