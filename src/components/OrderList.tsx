import React, { useState } from 'react';
import { useOrderStore } from '../stores/useOrderStore';
import { OrderType } from '../types';
import { Plus, Utensils, Truck, ShoppingBag, Store, Sparkles, CheckCircle2 } from 'lucide-react';

interface Props {
  onOpenNewModal: () => void;
}

export const OrderList: React.FC<Props> = ({ onOpenNewModal }) => {
  const { orders, activeOrderId, setActiveOrder, calculateOrderTotals } = useOrderStore();
  const [filterType, setFilterType] = useState<string>('todas');

  const openOrders = orders.filter((o) => o.status === 'aberta');
  const filteredOrders = openOrders.filter((o) => {
    if (filterType === 'todas') return true;
    return o.type === filterType;
  });

  const getIcon = (type: OrderType) => {
    switch (type) {
      case 'mesa':
        return Utensils;
      case 'delivery':
        return Truck;
      case 'retirada':
        return ShoppingBag;
      case 'balcao':
        return Store;
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
      {/* Cabeçalho */}
      <div className="p-3.5 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/95 shrink-0">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Mesas & Comandas</h2>
          <span className="text-[11px] text-zinc-500 font-mono font-medium">{openOrders.length} em atendimento</span>
        </div>
        <button
          type="button"
          onClick={onOpenNewModal}
          className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-2.5 py-1.5 rounded-xl flex items-center gap-1 shadow-md shadow-red-950 transition"
        >
          <Plus size={14} /> Nova
        </button>
      </div>

      {/* Filtros rápidos de tipo */}
      <div className="flex gap-1 p-2 border-b border-zinc-850 bg-zinc-950/40 text-[11px] shrink-0">
        {['todas', 'mesa', 'delivery', 'retirada', 'balcao'].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setFilterType(t)}
            className={`flex-1 py-1 rounded-lg capitalize font-medium transition text-center ${
              filterType === t
                ? 'bg-zinc-800 text-white font-bold'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Lista de Comandas / Mesas */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {filteredOrders.length === 0 ? (
          <div className="p-6 text-center text-zinc-500 text-xs">
            Nenhuma comanda aberta nesta categoria.
          </div>
        ) : (
          filteredOrders.map((order) => {
            const Icon = getIcon(order.type);
            const totals = calculateOrderTotals(order);
            const isSelected = order.id === activeOrderId;
            const totalItemsCount = order.items.reduce((sum, i) => sum + i.quantity, 0);

            return (
              <div
                key={order.id}
                onClick={() => setActiveOrder(order.id)}
                className={`p-3 rounded-xl border transition cursor-pointer select-none ${
                  isSelected
                    ? 'bg-red-950/40 border-red-500 text-white shadow-lg ring-1 ring-red-500/50'
                    : 'bg-zinc-950 hover:bg-zinc-850/80 border-zinc-800/80 text-zinc-300'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`p-2 rounded-xl flex items-center justify-center ${
                        isSelected ? 'bg-red-600 text-white shadow-md' : 'bg-zinc-900 text-zinc-400'
                      }`}
                    >
                      <Icon size={16} />
                    </span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-white">{order.code}</span>
                        {isSelected && (
                          <span className="text-[9px] bg-red-900/80 text-red-300 px-1 py-0.2 rounded font-bold uppercase">
                            Ativa
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-400 font-mono block mt-0.5">
                        {totalItemsCount} {totalItemsCount === 1 ? 'item' : 'itens'} lançados
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-bold font-mono text-emerald-400 block">
                      R$ {totals.total.toFixed(2)}
                    </span>
                    {order.isRodizio && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] text-amber-400 font-bold bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-900/50 mt-1">
                        <Sparkles size={8} /> Rodízio
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
