import { FieldValue, DocumentReference, QuerySnapshot, DocumentData } from 'firebase-admin/firestore';
import os from 'node:os';
import { getDb } from './firebase.js';
import { loadConfig } from './config.js';
import { printRawBuffer } from './printer.js';
import { formatPrintJobReceipt } from './escpos.js';
import { PrintJob, PrinterConfig } from './types.js';
import { logger } from './logger.js';

export class FirestorePrintListener {
  private config: PrinterConfig;
  private isProcessingQueue = false;
  private jobQueue: string[] = [];
  private unsubscribe: (() => void) | null = null;

  constructor(customConfig?: PrinterConfig) {
    this.config = customConfig || loadConfig();
  }

  /**
   * Inicia o listener em tempo real no Firestore
   */
  public start(): () => void {
    const db = getDb();
    const { restaurantId, printerRoles } = this.config;
    const activeRoles = printerRoles && printerRoles.length > 0 ? printerRoles : ['CAIXA', 'COZINHA', 'SUSHIBAR'];

    console.log(`[AGENT] Umai Sushi Print Agent iniciado`);
    console.log(`[FIRESTORE] Restaurante: "${restaurantId}" | Setores ativos: [${activeRoles.join(', ')}]`);
    console.log(`[FIRESTORE] Escutando jobs pendentes em /restaurants/${restaurantId}/printJobs...`);

    const printJobsRef = db
      .collection('restaurants')
      .doc(restaurantId)
      .collection('printJobs');

    // Query filtrando exclusivamente por status == 'pending'.
    // Sem ordenação no Firestore para não exigir índice composto do Firebase.
    // A ordenação FIFO (createdAt) e filtro de setores são executados estritamente em memória.
    const query = printJobsRef.where('status', '==', 'pending');

    this.unsubscribe = query.onSnapshot(
      (snapshot: QuerySnapshot<DocumentData>) => {
        if (snapshot.empty) {
          return;
        }

        const eligibleDocs = snapshot.docs
          .map(doc => ({ id: doc.id, data: doc.data() }))
          .filter(item => {
            if (item.data.status !== 'pending') return false;
            const role = String(item.data.printerRole || '').trim().toUpperCase();
            if (activeRoles.includes('TODOS') || activeRoles.includes('ALL')) return true;
            return activeRoles.includes(role);
          })
          .sort((a, b) => {
            const timeA = a.data.createdAt?.toMillis?.() || (a.data.createdAt?._seconds ? a.data.createdAt._seconds * 1000 : 0);
            const timeB = b.data.createdAt?.toMillis?.() || (b.data.createdAt?._seconds ? b.data.createdAt._seconds * 1000 : 0);
            return timeA - timeB;
          });

        eligibleDocs.forEach(({ id, data }) => {
          if (!this.jobQueue.includes(id)) {
            console.log(`[JOB ${id}] identificado para setor "${data.printerRole || 'CAIXA'}"`);
            this.jobQueue.push(id);
          }
        });

        // Dispara o processamento FIFO se não estiver em execução
        this.processQueue();
      },
      (error: Error) => {
        logger.error(`[FIRESTORE ERRO] Falha no listener de impressao: ${error.message}`);
      }
    );

    return () => {
      if (this.unsubscribe) {
        this.unsubscribe();
        this.unsubscribe = null;
        console.log(`[FIRESTORE] Listener cancelado.`);
      }
    };
  }

  /**
   * Processador da fila FIFO (1 job por vez)
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.jobQueue.length > 0) {
      const jobId = this.jobQueue.shift();
      if (!jobId) continue;

      try {
        await this.handleSingleJob(jobId);
      } catch (err: any) {
        console.error(`[JOB ${jobId}] FAILED: Excecao no fluxo de processamento: ${err.message}`);
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Executa a reserva atômica (Transação) e a impressão física do Job
   */
  private async handleSingleJob(jobId: string): Promise<void> {
    const db = getDb();
    const { restaurantId } = this.config;
    const jobRef: DocumentReference = db
      .collection('restaurants')
      .doc(restaurantId)
      .collection('printJobs')
      .doc(jobId);

    // =========================================================================
    // 1. CLAIM ATÔMICO DO JOB VIA TRANSAÇÃO FIRESTORE
    // =========================================================================
    let claimedJob: PrintJob | null = null;

    try {
      claimedJob = await db.runTransaction(async (transaction) => {
        const docSnap = await transaction.get(jobRef);

        if (!docSnap.exists) {
          return null;
        }

        const data = docSnap.data() as any;

        // Se o job não estiver mais pendente, outro agente reservou ou foi cancelado
        if (data.status !== 'pending') {
          return null;
        }

        // Transiciona para status = 'processing' de forma segura e atômica registrando o agente responsável
        const agentHostname = os.hostname();
        const agentPid = process.pid;
        const agentInstanceId = `${agentHostname}-${agentPid}`;

        transaction.update(jobRef, {
          status: 'processing',
          processingAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          claimedByAgent: agentInstanceId,
          claimedByHostname: agentHostname,
          claimedByPid: agentPid
        });

        return {
          id: docSnap.id,
          restaurantId: data.restaurantId || restaurantId,
          printerRole: data.printerRole,
          status: 'processing',
          content: data.content,
          createdAt: data.createdAt,
          retryCount: data.retryCount || 0
        } as PrintJob;
      });
    } catch (transactionErr: any) {
      console.error(`[JOB ${jobId}] FAILED: Falha na transacao de claim: ${transactionErr.message}`);
      return;
    }

    if (!claimedJob) {
      // Job ignorado pois não estava em estado 'pending' (já processado ou reservado por outro computador)
      return;
    }

    console.log(`[JOB ${jobId}] reservado exclusivamente por ${os.hostname()} (PID ${process.pid})`);

    // =========================================================================
    // 2. FORMATAÇÃO ESC/POS E IMPRESSÃO VIA WINDOWS SPOOLER RAW
    // =========================================================================
    let spoolerAccepted = false;
    let bytesSentCount = 0;

    try {
      console.log(`[JOB ${jobId}] enviando para ${this.config.printerName}`);

      const buffer = formatPrintJobReceipt(
        claimedJob,
        this.config.paperWidth,
        this.config.autoCut
      );

      const printResult = await printRawBuffer(this.config.printerName, buffer);

      if (printResult.success) {
        spoolerAccepted = true;
        bytesSentCount = printResult.bytesSent || buffer.length;
        console.log(`[JOB ${jobId}] Spooler aceitou ${bytesSentCount} bytes`);

        try {
          // Transiciona para completed
          await jobRef.update({
            status: 'completed',
            completedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            spoolerAcceptedBytes: bytesSentCount,
            errorMessage: null
          });

          console.log(`[JOB ${jobId}] completed`);
        } catch (dbErr: any) {
          // INTERRUPÇÃO APÓS ENVIO AO SPOOLER: O papel foi enviado, mas a rede caiu antes de salvar 'completed'.
          // Sinaliza situação incerta para evitar reenvio automático que duplicaria o cupom físico!
          console.error(`[JOB ${jobId}] ALERTA CRITICO: Spooler aceitou os bytes, mas houve falha ao registrar completed no Firestore: ${dbErr.message}`);
          try {
            await jobRef.update({
              status: 'spooler_sent_uncertain',
              spoolerSentAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
              spoolerAcceptedBytes: bytesSentCount,
              requiresManualReview: true,
              errorMessage: `Dados enviados ao Spooler (${bytesSentCount} bytes), mas falhou atualizacao final: ${dbErr.message}`
            });
          } catch {}
        }
      } else {
        const errorMsg = printResult.errorMessage || 'Falha desconhecida no Windows Spooler';
        console.error(`[JOB ${jobId}] FAILED: ${errorMsg}`);

        await jobRef.update({
          status: 'failed',
          failedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          retryCount: (claimedJob.retryCount || 0) + 1,
          errorMessage: errorMsg
        });
      }
    } catch (printErr: any) {
      const errorMsg = printErr.message || String(printErr);
      console.error(`[JOB ${jobId}] FAILED: ${errorMsg}`);

      // Se o spooler já havia aceito os bytes antes do erro, mantém status de incerteza
      const finalStatus = spoolerAccepted ? 'spooler_sent_uncertain' : 'failed';

      await jobRef.update({
        status: finalStatus,
        failedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        retryCount: (claimedJob.retryCount || 0) + 1,
        requiresManualReview: spoolerAccepted,
        errorMessage: errorMsg
      });
    }
  }
}
