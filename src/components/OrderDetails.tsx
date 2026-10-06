import React from 'react';
import { useOrderStore } from '../stores/useOrderStore';
import { Order } from '../types';
import {
  Printer,
  Trash2,
  Plus,
  Minus,
  CheckCircle,
  Sparkles,
  Percent,
  ChefHat,
  Receipt,
  QrCode,
  UtensilsCrossed,
} from 'lucide-react';

interface Props {
  order: Order | null;
  onOpenCheckout: () => void;
  onPrintReceipt: (order: Order, isFinal?: boolean) => void;
  onPrintKitchen: (orderCode: string, items: any[]) => void;
  isPrinterConnected: boolean;
}

export const OrderDetails: React.FC<Props> = ({
  order,
  onOpenCheckout,
  onPrintReceipt,
  onPrintKitchen,
  isPrinterConnected,
}) => {
  const {
    updateItemQuantity,
    removeItem,
    toggleRodizio,
    updateRodizioDetails,
    toggleServiceCharge,
    deleteOrder,
    calculateOrderTotals,
  } = useOrderStore();

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center text-zinc-500">
        <Receipt size={40} className="mb-3 opacity-30 text-zinc-400" />
        <p className="text-sm font-semibold text-zinc-400">Nenhuma comanda selecionada</p>
        <p className="text-xs text-zinc-600 mt-1">Selecione uma comanda ao lado ou abra uma nova.</p>
      </div>
    );
  }

  const totals = calculateOrderTotals(order);
  const adults = order.adultsCount ?? 1;
  const children = order.childrenCount ?? 0;

  const handleAdjustAdults = (delta: number) => {
    const newCount = Math.max(0, adults + delta);
    updateRodizioDetails(order.id, newCount, children);
  };

  const handleAdjustChildren = (delta: number) => {
    const newCount = Math.max(0, children + delta);
    updateRodizioDetails(order.id, adults, newCount);
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
      {/* Cabeçalho da Comanda / Mesa */}
      <div className="p-3 border-b border-zinc-800 bg-zinc-900/95 space-y-2.5 shrink-0">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white tracking-tight">{order.code}</h1>
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                {order.type}
              </span>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">
              Aberta às {new Date(order.openedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          {/* Botão de Cancelar/Excluir Comanda */}
          <button
            type="button"
            onClick={() => {
              if (confirm(`Deseja realmente cancelar/excluir a comanda ${order.code}?`)) {
                deleteOrder(order.id);
              }
            }}
            className="text-zinc-500 hover:text-rose-400 p-1.5 rounded-lg transition hover:bg-zinc-800"
            title="Cancelar/Excluir comanda"
          >
            <Trash2 size={16} />
          </button>
        </div>

        {/* Barra de Controles Rápidos (Rodízio & Taxa de Serviço) */}
        <div className="flex flex-wrap gap-1.5">
          {/* Rodízio Toggle */}
          <button
            type="button"
            onClick={() => toggleRodizio(order.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
              order.isRodizio
                ? 'bg-amber-950/70 border border-amber-500/70 text-amber-300'
                : 'bg-zinc-950 border border-zinc-800 text-zinc-400 hover:border-zinc-700'
            }`}
          >
            <Sparkles size={12} />
            <span>Rodízio: {order.isRodizio ? 'Ativo' : 'Inativo'}</span>
          </button>

          {/* Taxa de Serviço 10% */}
          <button
            type="button"
            onClick={() => toggleServiceCharge(order.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
              order.hasServiceCharge
                ? 'bg-blue-950/70 border border-blue-500/70 text-blue-300'
                : 'bg-zinc-950 border border-zinc-800 text-zinc-400 hover:border-zinc-700'
            }`}
          >
            <Percent size={12} />
            <span>10% Serviço: {order.hasServiceCharge ? 'Sim' : 'Não'}</span>
          </button>
        </div>

        {/* Painel do Rodízio com Adultos e Crianças */}
        {order.isRodizio && (
          <div className="p-2.5 bg-amber-950/30 border border-amber-900/50 rounded-xl space-y-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              {/* Adultos */}
              <div className="bg-zinc-950/80 p-2 rounded-lg border border-amber-900/30 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-amber-300 block">Adultos</span>
                  <span className="text-[9px] text-zinc-400">R$ 85 (PIX: R$ 79,90)</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleAdjustAdults(-1)}
                    className="w-5 h-5 rounded bg-zinc-800 hover:bg-zinc-700 text-white font-bold flex items-center justify-center text-xs"
                  >
                    -
                  </button>
                  <span className="w-4 text-center font-mono font-bold text-white text-xs">{adults}</span>
                  <button
                    type="button"
                    onClick={() => handleAdjustAdults(1)}
                    className="w-5 h-5 rounded bg-zinc-800 hover:bg-zinc-700 text-white font-bold flex items-center justify-center text-xs"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Crianças / Meia */}
              <div className="bg-zinc-950/80 p-2 rounded-lg border border-amber-900/30 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-amber-300 block">Crianças</span>
                  <span className="text-[9px] text-zinc-400">R$ 42,50 (PIX: R$ 39,90)</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleAdjustChildren(-1)}
                    className="w-5 h-5 rounded bg-zinc-800 hover:bg-zinc-700 text-white font-bold flex items-center justify-center text-xs"
                  >
                    -
                  </button>
                  <span className="w-4 text-center font-mono font-bold text-white text-xs">{children}</span>
                  <button
                    type="button"
                    onClick={() => handleAdjustChildren(1)}
                    className="w-5 h-5 rounded bg-zinc-800 hover:bg-zinc-700 text-white font-bold flex items-center justify-center text-xs"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center text-[10px] text-zinc-400 pt-0.5">
              <span>Sushis/Pratos inclusos: <strong className="text-amber-400">R$ 0,00</strong></span>
              <span className="text-emerald-400 font-semibold flex items-center gap-0.5">
                <QrCode size={10} /> Promo PIX R$ 79,90 / R$ 39,90
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Lista de Itens Lançados na Mesa */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
        {order.items.length === 0 ? (
          <div className="py-12 text-center text-zinc-500 text-xs flex flex-col items-center justify-center">
            <UtensilsCrossed size={32} className="mb-2 opacity-30 text-zinc-500" />
            <p className="font-semibold text-zinc-400">Nenhum item lançado ainda</p>
            <p className="text-zinc-600 mt-1">Clique nos produtos no cardápio ou digite o código para lançar.</p>
          </div>
        ) : (
          order.items.map((item) => {
            const isRodizioZero = order.isRodizio && item.isRodizioItem;
            const itemLineTotal = isRodizioZero ? 0 : item.price * item.quantity;

            return (
              <div
                key={item.id}
                className="p-2.5 bg-zinc-950 border border-zinc-850 rounded-xl flex items-center justify-between gap-2 text-xs hover:border-zinc-750 transition"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {item.code && (
                      <span className="text-[10px] font-mono font-bold text-red-400 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800 shrink-0">
                        #{item.code}
                      </span>
                    )}
                    <span className="font-bold text-zinc-100 truncate text-xs">{item.name}</span>
                    {isRodizioZero && (
                      <span className="text-[9px] bg-amber-950/70 text-amber-400 px-1.5 py-0.2 rounded font-bold shrink-0 border border-amber-900/40">
                        Incluso
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono mt-0.5">
                    <span>
                      {item.quantity}x {isRodizioZero ? 'R$ 0,00' : `R$ ${item.price.toFixed(2)}`}
                    </span>
                    {item.notes && <span className="text-zinc-400 italic">({item.notes})</span>}
                  </div>
                </div>

                {/* Subtotal da Linha e Controles de Quantidade (+) e (-) */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="font-mono font-bold text-zinc-100 mr-1 text-xs">
                    {isRodizioZero ? 'R$ 0,00' : `R$ ${itemLineTotal.toFixed(2)}`}
                  </span>

                  <button
                    type="button"
                    onClick={() => updateItemQuantity(order.id, item.id, -1)}
                    className="w-6 h-6 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 flex items-center justify-center border border-zinc-800 transition"
                    title="Diminuir 1"
                  >
                    <Minus size={12} />
                  </button>

                  <span className="w-5 text-center font-mono font-bold text-zinc-100 text-xs">
                    {item.quantity}
                  </span>

                  <button
                    type="button"
                    onClick={() => updateItemQuantity(order.id, item.id, 1)}
                    className="w-6 h-6 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 flex items-center justify-center border border-zinc-800 transition"
                    title="Adicionar 1"
                  >
                    <Plus size={12} />
                  </button>

                  <button
                    type="button"
                    onClick={() => removeItem(order.id, item.id)}
                    className="p-1 text-zinc-500 hover:text-rose-400 ml-0.5 transition"
                    title="Remover item"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Rodapé Financeiro e Botões de Impressão ESC/POS */}
      <div className="p-3 border-t border-zinc-800 bg-zinc-950 space-y-2.5 shrink-0">
        {/* Totais resumidos */}
        <div className="space-y-1 text-xs">
          {order.isRodizio && (
            <div className="flex justify-between text-amber-400 text-[11px]">
              <span>Rodízio ({adults} ad. + {children} cr.):</span>
              <span className="font-mono font-semibold">R$ {totals.rodizioTotal.toFixed(2)}</span>
            </div>
          )}

          {totals.itemsTotal > 0 && (
            <div className="flex justify-between text-zinc-400 text-[11px]">
              <span>Bebidas / Extras:</span>
              <span className="font-mono">R$ {totals.itemsTotal.toFixed(2)}</span>
            </div>
          )}

          {order.hasServiceCharge && (
            <div className="flex justify-between text-zinc-400 text-[11px]">
              <span>Taxa Serviço (10%):</span>
              <span className="font-mono">R$ {totals.serviceCharge.toFixed(2)}</span>
            </div>
          )}

          <div className="flex justify-between items-center text-sm font-bold text-emerald-400 pt-1.5 border-t border-zinc-850">
            <span className="uppercase tracking-wide text-xs">TOTAL ACUMULADO:</span>
            <span className="font-mono text-base text-emerald-400 font-extrabold">
              R$ {totals.total.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Botões de Ação */}
        <div className="grid grid-cols-3 gap-2">
          {/* Imprimir Pré-Conta */}
          <button
            type="button"
            onClick={() => onPrintReceipt(order, false)}
            disabled={order.items.length === 0 && !order.isRodizio}
            className="py-2 px-1 bg-zinc-900 hover:bg-zinc-850 border border-zinc-750 rounded-xl text-zinc-200 text-xs font-semibold flex flex-col items-center justify-center gap-1 disabled:opacity-40 transition"
            title="Imprimir cupom de conferência"
          >
            <Printer size={15} className="text-zinc-400" />
            <span>Pré-Conta</span>
          </button>

          {/* Imprimir Cozinha */}
          <button
            type="button"
            onClick={() => onPrintKitchen(order.code, order.items)}
            disabled={order.items.length === 0}
            className="py-2 px-1 bg-zinc-900 hover:bg-zinc-850 border border-zinc-750 rounded-xl text-zinc-200 text-xs font-semibold flex flex-col items-center justify-center gap-1 disabled:opacity-40 transition"
            title="Enviar pedido para a cozinha/sushibar"
          >
            <ChefHat size={15} className="text-amber-400" />
            <span>Cozinha</span>
          </button>

          {/* Fechar Conta */}
          <button
            type="button"
            onClick={onOpenCheckout}
            disabled={order.items.length === 0 && !order.isRodizio}
            className="py-2 px-1 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-white text-xs font-bold flex flex-col items-center justify-center gap-1 shadow-md shadow-emerald-950 disabled:opacity-40 transition"
          >
            <CheckCircle size={15} />
            <span>Fechar</span>
          </button>
        </div>
      </div>
    </div>
  );
};
