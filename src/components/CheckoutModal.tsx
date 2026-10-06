import React, { useState } from 'react';
import { useOrderStore } from '../stores/useOrderStore';
import { Order } from '../types';
import {
  CheckCircle,
  Printer,
  X,
  CreditCard,
  Banknote,
  QrCode,
  Sparkles,
  Percent,
} from 'lucide-react';

interface Props {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onPrintAndClose: (order: Order, paymentMethod: string, discount: number) => void;
  isPrinterConnected: boolean;
}

export const CheckoutModal: React.FC<Props> = ({
  order,
  isOpen,
  onClose,
  onPrintAndClose,
  isPrinterConnected,
}) => {
  const calculateOrderTotals = useOrderStore((state) => state.calculateOrderTotals);
  const [paymentMethod, setPaymentMethod] = useState('PIX');
  const [discountInput, setDiscountInput] = useState('0');

  if (!isOpen || !order) return null;

  const currentDiscount = parseFloat(discountInput) || 0;
  const tempOrder = { ...order, discount: currentDiscount, paymentMethod };
  const totals = calculateOrderTotals(tempOrder, paymentMethod);

  const handleConfirm = () => {
    onPrintAndClose(tempOrder, paymentMethod, currentDiscount);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 text-white shadow-2xl space-y-4">
        {/* Cabeçalho */}
        <div className="flex justify-between items-center pb-3 border-b border-zinc-800">
          <div>
            <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
              <CheckCircle size={20} className="text-emerald-500" /> Fechar Conta
            </h2>
            <p className="text-xs text-zinc-400 font-mono mt-0.5">{order.code}</p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white p-1 rounded-lg">
            <X size={20} />
          </button>
        </div>

        {/* Seleção de Forma de Pagamento */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
            Forma de Pagamento
          </label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'PIX', label: 'PIX (Desconto)', icon: QrCode, highlight: true },
              { id: 'Cartão de Crédito', label: 'Crédito', icon: CreditCard },
              { id: 'Cartão de Débito', label: 'Débito', icon: CreditCard },
              { id: 'Dinheiro', label: 'Dinheiro', icon: Banknote },
            ].map((p) => {
              const Icon = p.icon;
              const isSelected = paymentMethod === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPaymentMethod(p.id)}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition ${
                    isSelected
                      ? 'bg-emerald-950/70 border-emerald-500 text-emerald-300 shadow-md shadow-emerald-950'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <Icon size={16} className={isSelected ? 'text-emerald-400' : 'text-zinc-500'} />
                  <span>{p.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Alerta de Desconto PIX */}
        {paymentMethod === 'PIX' && order.isRodizio && (
          <div className="p-2.5 bg-emerald-950/40 border border-emerald-800/60 rounded-xl flex items-center gap-2 text-xs text-emerald-300">
            <Sparkles size={16} className="text-emerald-400 shrink-0" />
            <span>
              <strong>Valor Promocional PIX Aplicado:</strong> R$ 79,90 por adulto | R$ 39,90 por criança!
            </span>
          </div>
        )}

        {/* Demonstrativo Financeiro */}
        <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800/80 space-y-2 text-xs">
          {/* Rodízio Detalhado */}
          {order.isRodizio && (
            <div className="space-y-1.5 pb-2 border-b border-zinc-850">
              <div className="flex justify-between text-amber-300 font-semibold">
                <span className="flex items-center gap-1">
                  <Sparkles size={12} /> Rodízio ({order.adultsCount ?? 1}x Adultos + {order.childrenCount ?? 0}x Crianças):
                </span>
                <span className="font-mono font-bold">R$ {totals.rodizioTotal.toFixed(2)}</span>
              </div>

              <div className="text-[11px] text-zinc-400 pl-4 space-y-0.5 font-mono">
                {(order.adultsCount ?? 1) > 0 && (
                  <div className="flex justify-between">
                    <span>Adulto(s): {order.adultsCount}x R$ {totals.adultUnitPrice.toFixed(2)}</span>
                    <span>R$ {totals.adultsTotal.toFixed(2)}</span>
                  </div>
                )}
                {(order.childrenCount ?? 0) > 0 && (
                  <div className="flex justify-between">
                    <span>Criança(s): {order.childrenCount}x R$ {totals.childUnitPrice.toFixed(2)}</span>
                    <span>R$ {totals.childrenTotal.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Consumo Extra (Bebidas, Sobremesas, etc) */}
          <div className="flex justify-between text-zinc-400">
            <span>
              {order.isRodizio ? 'Bebidas e Extras à parte:' : 'Consumo dos Itens:'}
            </span>
            <span className="font-mono">R$ {totals.itemsTotal.toFixed(2)}</span>
          </div>

          {/* Taxa de Serviço 10% */}
          {order.hasServiceCharge && (
            <div className="flex justify-between text-zinc-400">
              <span className="flex items-center gap-1">
                <Percent size={11} /> Taxa de Serviço (10%):
              </span>
              <span className="font-mono">R$ {totals.serviceCharge.toFixed(2)}</span>
            </div>
          )}

          {/* Desconto Adicional */}
          <div className="flex justify-between items-center pt-1.5 border-t border-zinc-850">
            <span className="text-zinc-300 font-medium">Desconto Extra (R$):</span>
            <input
              type="number"
              min="0"
              step="0.5"
              value={discountInput}
              onChange={(e) => setDiscountInput(e.target.value)}
              className="w-24 bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1 text-right font-mono text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Total Final */}
          <div className="flex justify-between items-center pt-2.5 border-t border-zinc-800 text-sm font-bold">
            <span className="text-emerald-400 uppercase tracking-wide">TOTAL A PAGAR:</span>
            <span className="text-lg font-mono text-emerald-400">R$ {totals.total.toFixed(2)}</span>
          </div>
        </div>

        {/* Botão de Encerramento e Impressão USB */}
        <button
          type="button"
          onClick={handleConfirm}
          className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-950 transition"
        >
          <Printer size={16} />
          <span>
            {isPrinterConnected
              ? `Confirmar Pagamento (${paymentMethod}) e Imprimir`
              : `Finalizar Venda no ${paymentMethod}`}
          </span>
        </button>
      </div>
    </div>
  );
};
