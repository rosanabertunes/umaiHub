import React, { useState, useMemo, useEffect } from 'react';
import { 
  Printer, X, CheckCircle2, User, CreditCard, 
  QrCode, Banknote, AlertCircle, RefreshCw, 
  FileText, ShieldCheck, Check, Sparkles, Receipt
} from 'lucide-react';
import { formatCPF, isValidCPF, cleanCPF } from '../utils/cpfValidator';
import { 
  NonFiscalReceipt, 
  ReceiptItem, 
  UMAI_RESTAURANT_INFO, 
  getNextReceiptNumber, 
  persistNonFiscalReceipt, 
  buildThermalReceiptText,
  getConsumerIdentification
} from '../services/receiptService';
import { sendPrintJob, subscribeToJobStatus } from '../services/printJobService';

export interface OrderFinancial {
  adultPrice: number;
  kidPrice: number;
  rodizioAdultsTotal: number;
  rodizioKidsTotal: number;
  rodizioTotal: number;
  itemsTotal: number;
  subtotal: number;
  serviceTax: number;
  total: number;
}

export interface ModalOrderItem {
  id: string;
  productId?: string;
  code?: string;
  name: string;
  price: number;
  quantity: number;
  category?: string;
  isAlaCarteExtra?: boolean;
  isRodizioIncluded?: boolean;
}

interface NonFiscalReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderIdentifier: string;
  orderType: string;
  isRodizio: boolean;
  rodizioAdults: number;
  rodizioKids: number;
  items: ModalOrderItem[];
  financial: OrderFinancial;
  hasServiceTax: boolean;
  initialPaymentMethod?: string;
  initialMode?: 'conferir_tela' | 'conferir_imprimir';
  onCompleteOrder?: (paymentMethod: string, receipt: NonFiscalReceipt) => void;
}

export const NonFiscalReceiptModal: React.FC<NonFiscalReceiptModalProps> = ({
  isOpen,
  onClose,
  orderIdentifier,
  orderType,
  isRodizio,
  rodizioAdults,
  rodizioKids,
  items,
  financial,
  hasServiceTax,
  initialPaymentMethod = 'PIX',
  initialMode = 'conferir_imprimir',
  onCompleteOrder,
}) => {
  // Dados do consumidor (opcionais)
  const [customerName, setCustomerName] = useState('');
  const [customerCpf, setCustomerCpf] = useState('');
  const [paymentMethod, setPaymentMethod] = useState(initialPaymentMethod);
  const [discountAmount, setDiscountAmount] = useState<number>(0);

  // Estados de controle de emissão e ciclo de vida de impressão
  const [receiptNumber, setReceiptNumber] = useState<string>('');
  const [issuedReceipt, setIssuedReceipt] = useState<NonFiscalReceipt | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [reprintCount, setReprintCount] = useState<number>(1);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  // Status discriminado do fluxo
  const [printStage, setPrintStage] = useState<
    'idle' | 'saved_local' | 'job_created' | 'spooler_processing' | 'spooler_completed' | 'failed' | 'paper_confirmed'
  >('idle');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Inicializa o número da venda quando o modal abre
  useEffect(() => {
    if (isOpen) {
      if (!receiptNumber) {
        setReceiptNumber(getNextReceiptNumber());
      }
      setPrintStage('idle');
      setStatusMessage(null);
    }
  }, [isOpen]);

  // Escuta o progresso do job no Firestore em tempo real quando um job for criado
  useEffect(() => {
    if (!activeJobId) return;

    const unsub = subscribeToJobStatus(activeJobId, (job) => {
      if (!job) return;
      if (job.status === 'processing') {
        setPrintStage('spooler_processing');
        setStatusMessage('Print Agent reservou o trabalho e enviou ao Windows Spooler...');
      } else if (job.status === 'completed') {
        setPrintStage('spooler_completed');
        setStatusMessage('✓ Aceito pelo Windows Spooler (Confirme a saída física do papel na Epson TM-T20X)');
      } else if (job.status === 'spooler_sent_uncertain') {
        setPrintStage('failed');
        setStatusMessage('⚠ Situação incerta: Dados enviados ao Spooler, mas houve oscilação de rede. Verifique se o papel foi emitido antes de reimprimir.');
      } else if (job.status === 'failed') {
        setPrintStage('failed');
        setStatusMessage(`⚠ Falha no Print Agent Windows: ${job.errorMessage || 'Erro ao emitir no Spooler'}`);
      }
    });
    return () => unsub();
  }, [activeJobId]);

  // Validação de CPF estrita (somente quando preenchido)
  const cpfClean = cleanCPF(customerCpf);
  const isCpfFilled = cpfClean.length > 0;
  const isCpfValid = useMemo(() => {
    if (!isCpfFilled) return true;
    return isValidCPF(customerCpf);
  }, [customerCpf, isCpfFilled]);

  // Recálculo financeiro com base no método de pagamento selecionado
  const computedFinancial = useMemo(() => {
    const isPixOrCash = paymentMethod === 'PIX' || paymentMethod === 'Dinheiro';
    const adultUnitPrice = isPixOrCash ? 79.9 : 85.0;
    const kidUnitPrice = isPixOrCash ? 39.9 : 42.5;

    let rodizioTotal = 0;
    if (isRodizio) {
      rodizioTotal = (rodizioAdults * adultUnitPrice) + (rodizioKids * kidUnitPrice);
    }

    const itemsTotal = items.reduce((acc, it) => {
      if (isRodizio && it.isRodizioIncluded) return acc;
      return acc + (it.price * it.quantity);
    }, 0);

    const subtotal = rodizioTotal + itemsTotal;
    const serviceTax = hasServiceTax ? subtotal * 0.10 : 0;
    const discount = Math.max(0, discountAmount);
    const total = Math.max(0, subtotal + serviceTax - discount);

    return {
      adultPrice: adultUnitPrice,
      kidPrice: kidUnitPrice,
      rodizioTotal,
      itemsTotal,
      subtotal,
      serviceTax,
      discount,
      total,
      rodizioAdults,
      rodizioKids,
      paymentMethod,
    };
  }, [paymentMethod, isRodizio, rodizioAdults, rodizioKids, items, hasServiceTax, discountAmount]);

  // Converte itens da comanda no formato estrito do comprovante
  const receiptItems: ReceiptItem[] = useMemo(() => {
    return items.map((it, idx) => ({
      code: it.code || it.productId || String(idx + 1).padStart(3, '0'),
      name: it.name,
      quantity: it.quantity,
      unit: 'UN',
      unitPrice: it.isRodizioIncluded ? 0 : it.price,
      totalPrice: it.isRodizioIncluded ? 0 : it.price * it.quantity,
      isAlaCarteExtra: Boolean(it.isAlaCarteExtra),
      isRodizioIncluded: Boolean(it.isRodizioIncluded),
    }));
  }, [items]);

  // Constrói ou recupera o objeto de documento NonFiscalReceipt
  const currentReceiptData: NonFiscalReceipt = useMemo(() => {
    if (issuedReceipt) {
      return issuedReceipt;
    }
    const currentNumber = receiptNumber || 'VENDA Nº 00100';
    return {
      id: `receipt-${Date.now()}-${currentNumber.replace(/\D/g, '')}`,
      documentType: 'NON_FISCAL_RECEIPT',
      fiscalStatus: 'NOT_APPLICABLE',
      customerName: customerName.trim() || null,
      customerCpf: cpfClean.length === 11 ? formatCPF(cpfClean) : null,
      receiptNumber: currentNumber,
      receiptIssuedAt: new Date().toISOString(),
      receiptVersion: 1,
      restaurantId: 'umai-sushi',
      orderIdentifier,
      orderType,
      items: receiptItems,
      financial: computedFinancial,
      restaurantInfo: UMAI_RESTAURANT_INFO,
    };
  }, [issuedReceipt, receiptNumber, customerName, cpfClean, orderIdentifier, orderType, receiptItems, computedFinancial]);

  // Texto formatado de 48 colunas para visualização e impressão térmica
  const thermalReceiptText = useMemo(() => {
    return buildThermalReceiptText(currentReceiptData);
  }, [currentReceiptData]);

  // Ação de Impressão do Cupom Não Fiscal
  const handlePrintReceipt = async (isRePrint = false) => {
    if (isCpfFilled && !isCpfValid) {
      return;
    }

    setIsPrinting(true);
    setStatusMessage(null);

    const receiptToPrint: NonFiscalReceipt = isRePrint && issuedReceipt
      ? issuedReceipt
      : {
          ...currentReceiptData,
          customerName: customerName.trim() || null,
          customerCpf: cpfClean.length === 11 ? formatCPF(cpfClean) : null,
          financial: computedFinancial,
          receiptIssuedAt: isRePrint && issuedReceipt ? issuedReceipt.receiptIssuedAt : new Date().toISOString(),
        };

    // 1. Salva com garantia offline (Firestore local cache + localStorage)
    setPrintStage('saved_local');
    setStatusMessage('1. Salvo localmente neste aparelho...');
    await persistNonFiscalReceipt(receiptToPrint);
    setIssuedReceipt(receiptToPrint);

    const nextCopy = isRePrint ? reprintCount + 1 : 1;
    if (isRePrint) {
      setReprintCount(nextCopy);
    }

    // 2. Envia para a fila do Print Agent (Epson TM-T20X)
    try {
      const res = await sendPrintJob({
        restaurantId: 'umai-sushi',
        printerRole: 'CAIXA',
        printerName: 'EPSON TM-T20X Receipt',
        title: `CUPOM NAO FISCAL [${orderIdentifier}]`,
        orderIdentifier,
        orderType,
        isConference: false,
        isRePrint,
        idempotencyKey: isRePrint ? `${orderIdentifier}-reprint-${nextCopy}` : `${orderIdentifier}-receipt`,
        originalJobId: issuedReceipt?.id || undefined,
        copyNumber: isRePrint ? nextCopy : 1,
        customerName: receiptToPrint.customerName,
        customerCpf: receiptToPrint.customerCpf,
        receiptNumber: receiptToPrint.receiptNumber,
        documentType: 'NON_FISCAL_RECEIPT',
        fiscalStatus: 'NOT_APPLICABLE',
        receiptVersion: 1,
        financial: receiptToPrint.financial,
        rawText: thermalReceiptText,
        items: receiptToPrint.items.map((i) => ({
          code: i.code,
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          price: i.unitPrice,
          isAlaCarteExtra: i.isAlaCarteExtra,
          isRodizioIncluded: i.isRodizioIncluded,
        })),
      });

      setIsPrinting(false);

      if (res.success) {
        setActiveJobId(res.jobId);
        setPrintStage('job_created');
        setStatusMessage(
          isRePrint
            ? `✓ Reimpressão (${nextCopy}ª via) registrada na fila (Job: ${res.jobId.slice(-6)})`
            : `✓ Comprovante registrado na fila de impressão (Job: ${res.jobId.slice(-6)})`
        );
      } else {
        setPrintStage('failed');
        setStatusMessage(`⚠ Falha no envio para o spooler: ${res.error || 'Erro ao registrar job'}`);
      }
    } catch (err: any) {
      setIsPrinting(false);
      setPrintStage('failed');
      setStatusMessage(`⚠ Erro inesperado ao disparar impressão: ${err?.message || String(err)}`);
    }
  };

  const handleFinishSale = () => {
    if (onCompleteOrder && issuedReceipt) {
      onCompleteOrder(paymentMethod, issuedReceipt);
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-white animate-in fade-in zoom-in-95 duration-200">
        
        {/* CABEÇALHO DO MODAL */}
        <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-950 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Receipt size={22} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                {initialMode === 'conferir_tela' ? 'Conferir na Tela — Cupom Não Fiscal' : 'Conferir e Imprimir — Cupom Não Fiscal'}
              </h2>
              <p className="text-xs text-zinc-400 flex items-center gap-2 font-mono">
                <span>{orderType}: <strong className="text-zinc-200">{orderIdentifier}</strong></span>
                <span>•</span>
                <span className="text-amber-400 font-bold">{receiptNumber || 'VENDA Nº 00124'}</span>
                <span>•</span>
                <span className="text-emerald-400 font-semibold">Sem Valor Fiscal</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
            title="Fechar Janela"
          >
            <X size={20} />
          </button>
        </div>

        {/* PAINEL DISCRIMINADO DE ESTADOS DO FLUXO DE IMPRESSÃO */}
        {printStage !== 'idle' && (
          <div className={`mx-6 mt-4 p-3 rounded-2xl text-xs border transition ${
            printStage === 'failed'
              ? 'bg-rose-950/80 border-rose-700 text-rose-300'
              : printStage === 'paper_confirmed'
              ? 'bg-emerald-950/90 border-emerald-600 text-emerald-200'
              : printStage === 'spooler_completed'
              ? 'bg-emerald-950/80 border-emerald-700 text-emerald-300'
              : 'bg-zinc-950 border-amber-800/80 text-amber-300'
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                {printStage === 'failed' ? (
                  <AlertCircle size={18} className="text-rose-400 shrink-0" />
                ) : printStage === 'paper_confirmed' ? (
                  <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
                ) : (
                  <RefreshCw size={18} className="text-amber-400 shrink-0 animate-spin" />
                )}
                <div>
                  <p className="font-bold">{statusMessage || 'Processando solicitação...'}</p>
                  <p className="text-[10px] text-zinc-400 font-mono mt-0.5">
                    Estágio: 1. Salvo localmente ✓ • 2. Fila Firestore {printStage !== 'saving' ? '✓' : '...'} • 3. Spooler Windows {printStage === 'spooler_completed' || printStage === 'paper_confirmed' ? '✓' : '...'}
                  </p>
                </div>
              </div>

              {/* Botão de Confirmação Física do Atendente */}
              {printStage === 'spooler_completed' && (
                <button
                  type="button"
                  onClick={() => {
                    setPrintStage('paper_confirmed');
                    setStatusMessage('✓ Papel e guilhotina conferidos com sucesso pelo atendente!');
                  }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[11px] font-bold shadow transition flex items-center gap-1.5 self-start sm:self-auto"
                >
                  <Check size={14} /> Confirmar Saída do Papel
                </button>
              )}
            </div>
          </div>
        )}

        {/* CORPO: 2 COLUNAS (FORMULÁRIO DE CONFERÊNCIA + PRÉVIA TÉRMICA 80MM) */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* COLUNA ESQUERDA: PARÂMETROS E IDENTIFICAÇÃO DO CLIENTE (7 COLUNAS) */}
          <div className="lg:col-span-6 space-y-5">
            
            {/* Bloco 1: Identificação Opcional do Consumidor */}
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 space-y-3.5">
              <div className="flex items-center justify-between border-b border-zinc-850 pb-2">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                  <User size={15} className="text-amber-400" /> Identificação do Consumidor
                </span>
                <span className="text-[11px] text-zinc-500 font-medium">(Opcional)</span>
              </div>

              {/* Nome do Cliente */}
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1">
                  Nome do Cliente
                </label>
                <input
                  type="text"
                  placeholder="Ex: João da Silva (opcional)"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500 transition font-medium"
                />
              </div>

              {/* CPF do Cliente com máscara 000.000.000-00 e validação */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-zinc-300">
                    CPF do Cliente
                  </label>
                  {isCpfFilled && (
                    <span className={`text-[11px] font-bold flex items-center gap-1 ${
                      isCpfValid ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {isCpfValid ? (
                        <><Check size={12} /> CPF Válido</>
                      ) : (
                        <><AlertCircle size={12} /> CPF Inválido</>
                      )}
                    </span>
                  )}
                </div>

                <input
                  type="text"
                  placeholder="000.000.000-00"
                  maxLength={14}
                  value={customerCpf}
                  onChange={(e) => setCustomerCpf(formatCPF(e.target.value))}
                  className={`w-full bg-zinc-900 border rounded-xl px-3.5 py-2.5 text-xs font-mono text-white placeholder:text-zinc-600 focus:outline-none transition ${
                    isCpfFilled && !isCpfValid
                      ? 'border-rose-500 focus:border-rose-500 bg-rose-950/20'
                      : isCpfFilled && isCpfValid
                      ? 'border-emerald-500 focus:border-emerald-500 bg-emerald-950/20'
                      : 'border-zinc-700 focus:border-amber-500'
                  }`}
                />

                {isCpfFilled && !isCpfValid && (
                  <p className="text-[11px] text-rose-400 mt-1.5 flex items-center gap-1">
                    <AlertCircle size={12} /> Os 11 dígitos do CPF não conferem com o cálculo da Receita.
                  </p>
                )}

                <p className="text-[11px] text-zinc-500 mt-1">
                  Se não preenchido, será impresso automaticamente: <strong className="text-zinc-400">CONSUMIDOR NÃO IDENTIFICADO</strong>.
                </p>
              </div>
            </div>

            {/* Bloco 2: Seleção da Forma de Pagamento */}
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 space-y-3">
              <label className="block text-xs font-black uppercase tracking-wider text-zinc-300">
                Forma de Pagamento
              </label>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('PIX')}
                  className={`p-3 rounded-2xl border text-xs font-black flex flex-col items-center gap-1 transition ${
                    paymentMethod === 'PIX'
                      ? 'bg-emerald-950 border-emerald-500 text-emerald-300 shadow-md ring-1 ring-emerald-500'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <QrCode size={18} />
                  <span>PIX</span>
                  <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-950 px-1.5 py-0.5 rounded">R$ 79,90</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('Dinheiro')}
                  className={`p-3 rounded-2xl border text-xs font-black flex flex-col items-center gap-1 transition ${
                    paymentMethod === 'Dinheiro'
                      ? 'bg-emerald-950 border-emerald-500 text-emerald-300 shadow-md ring-1 ring-emerald-500'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <Banknote size={18} />
                  <span>Dinheiro</span>
                  <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-950 px-1.5 py-0.5 rounded">R$ 79,90</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('Cartão')}
                  className={`p-3 rounded-2xl border text-xs font-black flex flex-col items-center gap-1 transition ${
                    paymentMethod === 'Cartão'
                      ? 'bg-rose-950 border-rose-500 text-rose-300 shadow-md ring-1 ring-rose-500'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <CreditCard size={18} />
                  <span>Cartão</span>
                  <span className="text-[10px] text-zinc-500 font-normal">R$ 85,00</span>
                </button>
              </div>

              {/* Desconto Adicional */}
              <div className="flex justify-between items-center pt-2 border-t border-zinc-850">
                <span className="text-xs text-zinc-400 font-medium">Desconto Extra (R$):</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={discountAmount || ''}
                  placeholder="0,00"
                  onChange={(e) => setDiscountAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-24 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 text-right font-mono text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Bloco 3: Resumo Financeiro da Comanda */}
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 space-y-2 text-xs">
              <div className="flex justify-between text-zinc-400">
                <span>Subtotal ({items.length} itens):</span>
                <span className="font-mono text-zinc-200">R$ {computedFinancial.subtotal.toFixed(2)}</span>
              </div>

              {hasServiceTax && (
                <div className="flex justify-between text-amber-400 font-medium">
                  <span>Taxa de Atendimento (10%):</span>
                  <span className="font-mono">R$ {computedFinancial.serviceTax.toFixed(2)}</span>
                </div>
              )}

              {computedFinancial.discount > 0 && (
                <div className="flex justify-between text-emerald-400 font-medium">
                  <span>Desconto Aplicado:</span>
                  <span className="font-mono">- R$ {computedFinancial.discount.toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between items-center pt-2 border-t border-zinc-800 font-black text-sm text-white">
                <span className="uppercase tracking-wide">TOTAL FINAL:</span>
                <span className="text-xl font-mono text-emerald-400">R$ {computedFinancial.total.toFixed(2)}</span>
              </div>
            </div>

            {/* BOTÕES DE IMPRESSÃO CONFORME ESPECIFICAÇÃO */}
            <div className="space-y-2.5 pt-2">
              
              {/* Botão: Imprimir cupom não fiscal (1ª via) ou Reimpressão se já impresso */}
              {!issuedReceipt ? (
                <button
                  type="button"
                  onClick={() => handlePrintReceipt(false)}
                  disabled={isPrinting || (isCpfFilled && !isCpfValid)}
                  className={`w-full py-3.5 rounded-2xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xl transition active:scale-[0.98] ${
                    isCpfFilled && !isCpfValid
                      ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700'
                      : 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-950/60'
                  }`}
                >
                  <Printer size={18} />
                  <span>
                    {isPrinting
                      ? 'Enviando para Epson TM-T20X...'
                      : 'Conferir e Imprimir Cupom Não Fiscal'}
                  </span>
                </button>
              ) : (
                <div className="p-3 bg-emerald-950/60 border border-emerald-800 rounded-2xl text-center">
                  <p className="text-xs font-bold text-emerald-300 flex items-center justify-center gap-1.5">
                    <CheckCircle2 size={16} /> 1ª Via do Cupom Emitida ({receiptNumber})
                  </p>
                  <p className="text-[10px] text-zinc-400 mt-0.5">
                    Para emitir outra via no papel, use a ação explícita de Reimpressão abaixo:
                  </p>
                </div>
              )}

              {/* Botão de Ação Explícita: REIMPRIMIR (identificada como nova via) */}
              <button
                type="button"
                onClick={() => handlePrintReceipt(true)}
                disabled={isPrinting}
                className={`w-full py-3 rounded-2xl border font-bold text-xs flex items-center justify-center gap-2 transition active:scale-[0.98] ${
                  issuedReceipt
                    ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-500 shadow-lg shadow-amber-950/50'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                }`}
              >
                <RefreshCw size={15} className={isPrinting ? 'animate-spin' : ''} />
                <span>
                  {issuedReceipt
                    ? `Reimprimir Cupom (${reprintCount + 1}ª Via — Nova Cópia)`
                    : 'Reimprimir Cupom (Nova Via)'}
                </span>
              </button>

              <div className="grid grid-cols-2 gap-2 pt-1">
                {/* Fechar modal mantendo comanda aberta */}
                <button
                  type="button"
                  onClick={onClose}
                  className="py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                >
                  <X size={14} /> Manter Mesa Aberta
                </button>

                {/* Finalizar Venda & Fechar Comanda */}
                {onCompleteOrder && (
                  <button
                    type="button"
                    onClick={handleFinishSale}
                    className="py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-black flex items-center justify-center gap-1.5 transition shadow-md shadow-emerald-950"
                  >
                    <CheckCircle2 size={14} /> Concluir & Fechar Mesa
                  </button>
                )}
              </div>
            </div>

          </div>

          {/* COLUNA DIREITA: PRÉVIA FIEL DO CUPOM TÉRMICO 80MM / 72MM (6 COLUNAS) */}
          <div className="lg:col-span-6 flex flex-col">
            <div className="flex justify-between items-center mb-2 px-1">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <FileText size={14} className="text-emerald-400" /> Prévia do Cupom Térmico (80mm)
              </span>
              <span className="text-[10px] text-zinc-500 font-mono bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
                Largura 72mm • 48 Colunas
              </span>
            </div>

            {/* Papel Térmico Simulado */}
            <div className="flex-1 bg-white text-black font-mono text-[11px] leading-[1.35] p-5 rounded-2xl shadow-2xl border-4 border-zinc-800 overflow-y-auto max-h-[520px] select-text">
              <div className="text-center font-bold pb-2 border-b border-dashed border-zinc-400">
                <p className="text-sm font-black tracking-wider">{UMAI_RESTAURANT_INFO.name}</p>
                <p className="text-[10px] text-zinc-700">{UMAI_RESTAURANT_INFO.subtitle}</p>
                <p className="text-[10px] text-zinc-700">CNPJ: {UMAI_RESTAURANT_INFO.cnpj}</p>
                <p className="text-[10px] text-zinc-700">{UMAI_RESTAURANT_INFO.address}</p>
                <p className="text-[10px] text-zinc-700">Tel: {UMAI_RESTAURANT_INFO.phone}</p>
              </div>

              {/* Cabeçalho Não Fiscal em destaque */}
              <div className="py-2 text-center border-b border-dashed border-zinc-400 bg-zinc-100 my-1 font-black">
                <p className="text-xs tracking-wider">CUPOM NÃO FISCAL</p>
                <p className="text-[10px] text-zinc-800 font-bold">COMPROVANTE DE VENDA</p>
                <p className="text-[10px] text-zinc-600 font-normal">SEM VALOR FISCAL</p>
              </div>

              {/* Informações da Venda */}
              <div className="py-1.5 border-b border-dashed border-zinc-400 text-[10.5px]">
                <div className="flex justify-between font-bold">
                  <span>{currentReceiptData.receiptNumber}</span>
                  <span>{new Date(currentReceiptData.receiptIssuedAt).toLocaleTimeString('pt-BR')}</span>
                </div>
                <div className="flex justify-between text-zinc-700">
                  <span>DATA: {new Date(currentReceiptData.receiptIssuedAt).toLocaleDateString('pt-BR')}</span>
                  <span>{orderType.toUpperCase()}: {orderIdentifier}</span>
                </div>
              </div>

              {/* Identificação do Consumidor */}
              <div className="py-2 border-b border-dashed border-zinc-400 text-[10.5px]">
                <p className="text-[9.5px] font-bold text-zinc-500 uppercase">IDENTIFICAÇÃO DO CONSUMIDOR:</p>
                {getConsumerIdentification(customerName, customerCpf).map((line, i) => (
                  <p key={i} className="font-bold text-zinc-900">{line}</p>
                ))}
              </div>

              {/* Tabela de Produtos */}
              <div className="py-2 border-b border-dashed border-zinc-400">
                <div className="flex justify-between text-[9.5px] font-bold text-zinc-600 pb-1 border-b border-zinc-200">
                  <span>COD DESCRIÇÃO</span>
                  <span>QTD UN V.UN TOTAL</span>
                </div>

                {/* Rodízio */}
                {isRodizio && (
                  <div className="py-1 border-b border-zinc-200 text-[10.5px]">
                    <p className="font-bold">[ MODO RODÍZIO ]</p>
                    {rodizioAdults > 0 && (
                      <div className="flex justify-between pl-1">
                        <span>RODÍZIO ADULTO ({rodizioAdults}x)</span>
                        <span>R$ {(rodizioAdults * computedFinancial.adultPrice).toFixed(2)}</span>
                      </div>
                    )}
                    {rodizioKids > 0 && (
                      <div className="flex justify-between pl-1">
                        <span>RODÍZIO CRIANÇA ({rodizioKids}x)</span>
                        <span>R$ {(rodizioKids * computedFinancial.kidPrice).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Itens reais lançados */}
                <div className="space-y-1 pt-1">
                  {items.length === 0 && !isRodizio ? (
                    <p className="text-zinc-500 text-center py-1 italic">Nenhum item lançado</p>
                  ) : (
                    items.map((it, idx) => {
                      const isZero = isRodizio && it.isRodizioIncluded;
                      return (
                        <div key={it.id} className="text-[10px]">
                          <div className="flex justify-between font-bold">
                            <span className="truncate pr-1">
                              {it.code || String(idx + 1).padStart(3, '0')} {it.name}
                              {it.isAlaCarteExtra && ' (À la Carte)'}
                            </span>
                            <span>{isZero ? 'INCLUSO' : `R$ ${(it.price * it.quantity).toFixed(2)}`}</span>
                          </div>
                          <div className="text-[9px] text-zinc-600 pl-2">
                            {it.quantity} UN x R$ {it.price.toFixed(2)}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Totais */}
              <div className="py-2 border-b border-dashed border-zinc-400 space-y-1 text-[10.5px]">
                <div className="flex justify-between">
                  <span>SUBTOTAL:</span>
                  <span>R$ {computedFinancial.subtotal.toFixed(2)}</span>
                </div>
                {hasServiceTax && (
                  <div className="flex justify-between">
                    <span>TAXA DE SERVIÇO (10%):</span>
                    <span>R$ {computedFinancial.serviceTax.toFixed(2)}</span>
                  </div>
                )}
                {computedFinancial.discount > 0 && (
                  <div className="flex justify-between font-bold">
                    <span>DESCONTO:</span>
                    <span>- R$ {computedFinancial.discount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs font-black pt-1 border-t border-zinc-300">
                  <span>TOTAL A PAGAR:</span>
                  <span>R$ {computedFinancial.total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-[10px] text-zinc-700">
                  <span>PAGAMENTO:</span>
                  <span>{paymentMethod.toUpperCase()} (R$ {computedFinancial.total.toFixed(2)})</span>
                </div>
              </div>

              {/* Rodapé e Agradecimento */}
              <div className="text-center pt-2 text-[10px] text-zinc-700">
                <p className="font-bold">Obrigado pela preferência!</p>
                <p>Volte sempre ao Umai Sushi!</p>
                <p className="text-[8px] text-zinc-500 pt-1 font-mono">
                  SISTEMA PDV UMAI SUSHI • EPSON TM-T20X
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
