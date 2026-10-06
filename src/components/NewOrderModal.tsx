import React, { useState } from 'react';
import { useOrderStore } from '../stores/useOrderStore';
import { OrderType } from '../types';
import { Plus, Utensils, Truck, ShoppingBag, Store, X, Users, Sparkles, QrCode } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const NewOrderModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const openOrder = useOrderStore((state) => state.openOrder);
  const [code, setCode] = useState('');
  const [type, setType] = useState<OrderType>('mesa');
  const [isRodizio, setIsRodizio] = useState(true); // Padrão rodízio ativo para restaurantes de sushi
  const [adultsCount, setAdultsCount] = useState(1);
  const [childrenCount, setChildrenCount] = useState(0);

  const adultStandard = 85.0;
  const adultPix = 79.9;
  const childStandard = 42.5;
  const childPix = 39.9;

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    openOrder(
      code || `${type.toUpperCase()} ${Date.now().toString().slice(-4)}`,
      type,
      isRodizio,
      adultsCount,
      childrenCount,
      adultStandard,
      adultPix,
      childStandard,
      childPix
    );
    setCode('');
    setAdultsCount(1);
    setChildrenCount(0);
    setIsRodizio(true);
    onClose();
  };

  const totalStandard = adultsCount * adultStandard + childrenCount * childStandard;
  const totalPix = adultsCount * adultPix + childrenCount * childPix;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 text-white shadow-2xl space-y-4">
        <div className="flex justify-between items-center pb-3 border-b border-zinc-800">
          <h2 className="text-base font-bold flex items-center gap-2 text-zinc-100">
            <Plus size={20} className="text-red-500" /> Abrir Nova Comanda
          </h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white p-1 rounded-lg">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Identificador Livre */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
              Identificador da Comanda (Mesa, Nome, Código)
            </label>
            <input
              type="text"
              required
              placeholder="Ex: Mesa 01, Delivery Ana, Balcão..."
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-2.5 text-white font-medium focus:border-red-500 focus:outline-none"
              autoFocus
            />
          </div>

          {/* Tipo de Atendimento */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
              Tipo de Atendimento
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: 'mesa', label: 'Mesa', icon: Utensils },
                { id: 'delivery', label: 'Delivery', icon: Truck },
                { id: 'retirada', label: 'Retirada', icon: ShoppingBag },
                { id: 'balcao', label: 'Balcão', icon: Store },
              ].map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setType(t.id as OrderType)}
                    className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border text-xs font-medium transition ${
                      type === t.id
                        ? 'bg-red-950/60 border-red-500 text-red-400 font-bold'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <Icon size={16} />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Seletor de Rodízio com Adultos e Crianças */}
          <div className="p-3.5 bg-zinc-950 rounded-xl border border-zinc-800 space-y-3">
            <label className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-amber-400" />
                <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider">
                  Modo Rodízio Ativo
                </span>
              </div>
              <input
                type="checkbox"
                checked={isRodizio}
                onChange={(e) => setIsRodizio(e.target.checked)}
                className="w-4 h-4 accent-red-600 rounded cursor-pointer"
              />
            </label>

            {isRodizio && (
              <div className="space-y-3 pt-2 border-t border-zinc-850">
                {/* Quantidade de Adultos */}
                <div className="flex items-center justify-between bg-zinc-900/90 p-2.5 rounded-xl border border-zinc-800">
                  <div>
                    <span className="text-xs font-bold text-zinc-200 block">Adultos</span>
                    <span className="text-[10px] text-zinc-400">
                      R$ 85,00 <span className="text-emerald-400 font-semibold">(PIX: R$ 79,90)</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setAdultsCount((prev) => Math.max(0, prev - 1))}
                      className="w-7 h-7 rounded-lg bg-zinc-800 text-zinc-300 font-bold hover:bg-zinc-700 flex items-center justify-center text-sm"
                    >
                      -
                    </button>
                    <span className="w-6 text-center font-mono font-bold text-sm text-white">
                      {adultsCount}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAdultsCount((prev) => prev + 1)}
                      className="w-7 h-7 rounded-lg bg-zinc-800 text-zinc-300 font-bold hover:bg-zinc-700 flex items-center justify-center text-sm"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Quantidade de Crianças / Meia */}
                <div className="flex items-center justify-between bg-zinc-900/90 p-2.5 rounded-xl border border-zinc-800">
                  <div>
                    <span className="text-xs font-bold text-zinc-200 block">Crianças / Meia</span>
                    <span className="text-[10px] text-zinc-400">
                      R$ 42,50 <span className="text-emerald-400 font-semibold">(PIX: R$ 39,90)</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setChildrenCount((prev) => Math.max(0, prev - 1))}
                      className="w-7 h-7 rounded-lg bg-zinc-800 text-zinc-300 font-bold hover:bg-zinc-700 flex items-center justify-center text-sm"
                    >
                      -
                    </button>
                    <span className="w-6 text-center font-mono font-bold text-sm text-white">
                      {childrenCount}
                    </span>
                    <button
                      type="button"
                      onClick={() => setChildrenCount((prev) => prev + 1)}
                      className="w-7 h-7 rounded-lg bg-zinc-800 text-zinc-300 font-bold hover:bg-zinc-700 flex items-center justify-center text-sm"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Estimativa de Valor */}
                <div className="flex justify-between items-center text-[11px] px-1 text-zinc-400 pt-1">
                  <span>Subtotal Padrão: <strong>R$ {totalStandard.toFixed(2)}</strong></span>
                  <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                    <QrCode size={12} /> No PIX: R$ {totalPix.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="w-1/3 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 font-semibold hover:bg-zinc-800 text-xs"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="w-2/3 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-lg shadow-red-900/30"
            >
              Abrir Comanda
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
