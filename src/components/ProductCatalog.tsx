import React, { useState, useMemo } from 'react';
import { useOrderStore } from '../stores/useOrderStore';
import { INITIAL_PRODUCTS } from '../data/initialProducts';
import { Product } from '../types';
import { Search, Plus, Sparkles, Check, Hash } from 'lucide-react';

interface Props {
  activeOrderId: string | null;
  onRequireOpenModal?: () => void;
}

const CATEGORY_LIST = [
  'Todos',
  'Temakis',
  'Sushis',
  'Combinados',
  'Especiais',
  'Bebidas',
  'Sobremesas',
];

export const ProductCatalog: React.FC<Props> = ({ activeOrderId, onRequireOpenModal }) => {
  const {
    products,
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    setSearchQuery,
    addItemToOrder,
    orders,
    openOrder,
  } = useOrderStore();

  const [fastCodeInput, setFastCodeInput] = useState('');
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  // Mesa/Comanda ativa no momento
  const activeOrder = orders.find((o) => o.id === activeOrderId && o.status === 'aberta') ||
                      orders.find((o) => o.status === 'aberta') || null;

  // Garante acesso à lista completa de produtos
  const allProducts = products && products.length > 0 ? products : INITIAL_PRODUCTS;

  // Categorias com contagem de produtos
  const categories = useMemo(() => {
    return CATEGORY_LIST;
  }, []);

  // Filtro de produtos em tempo real (categoria e texto/código digitado na busca)
  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return allProducts.filter((p) => {
      // 1. Filtro de Categoria
      const matchCategory = selectedCategory === 'Todos' || p.category === selectedCategory;

      // 2. Filtro de Busca (Nome ou Código)
      let matchQuery = true;
      if (q) {
        matchQuery =
          p.name.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q);
      }

      return matchCategory && matchQuery;
    });
  }, [allProducts, selectedCategory, searchQuery]);

  // Lançamento rápido por Código (ex: digitar 101 + Enter)
  const handleFastCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const codeToFind = fastCodeInput.trim();
    if (!codeToFind) return;

    const matched = allProducts.find(
      (p) => p.code.toLowerCase() === codeToFind.toLowerCase()
    );

    if (matched) {
      handleAdd(matched);
      setFastCodeInput('');
    } else {
      // Feedback se o código não existir
      alert(`Produto com código #${codeToFind} não encontrado no cardápio.`);
    }
  };

  // Lançamento por clique em qualquer card
  const handleAdd = (product: Product) => {
    let targetOrderId = activeOrderId;

    // Se nenhuma mesa estiver selecionada, busca a primeira mesa aberta ou abre Balcão
    if (!targetOrderId || !orders.some((o) => o.id === targetOrderId && o.status === 'aberta')) {
      const openOrd = orders.find((o) => o.status === 'aberta');
      if (openOrd) {
        targetOrderId = openOrd.id;
      } else {
        if (onRequireOpenModal) {
          onRequireOpenModal();
          return;
        } else {
          targetOrderId = openOrder('Mesa 01', 'mesa', true, 1, 0);
        }
      }
    }

    if (targetOrderId) {
      addItemToOrder(targetOrderId, product, 1);
      setJustAddedId(product.id);
      setTimeout(() => setJustAddedId(null), 500);
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
      {/* Barra Superior: Busca, Código Rápido e Categorias */}
      <div className="p-3 border-b border-zinc-800 bg-zinc-900/95 space-y-2.5 shrink-0">
        {/* Linha de Busca e Código */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
          {/* Campo de Código Rápido com Disparo por Enter */}
          <form onSubmit={handleFastCodeSubmit} className="sm:col-span-4">
            <div className="relative">
              <span className="absolute left-2.5 top-2 text-red-500 font-mono font-bold text-xs">#</span>
              <input
                type="text"
                placeholder="Cód (ex: 101) + ↵"
                value={fastCodeInput}
                onChange={(e) => setFastCodeInput(e.target.value)}
                className="w-full bg-zinc-950 border border-red-900/60 text-red-400 placeholder:text-zinc-500 font-mono font-bold rounded-xl pl-6 pr-2 py-2 text-xs focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition"
              />
            </div>
          </form>

          {/* Campo de Busca Geral por Nome e Código */}
          <div className="sm:col-span-8 relative">
            <Search size={14} className="absolute left-3 top-2.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Buscar item ou código (ex: Salmão, 201)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 placeholder:text-zinc-600 rounded-xl pl-8 pr-7 py-2 text-xs text-white focus:outline-none focus:border-zinc-700"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-xs text-zinc-500 hover:text-zinc-300"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Botões de Categorias (Todos, Temakis, Sushis, Combinados, Especiais, Bebidas, Sobremesas) */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
          {categories.map((cat) => {
            const count =
              cat === 'Todos'
                ? allProducts.length
                : allProducts.filter((p) => p.category === cat).length;
            const isSelected = selectedCategory === cat;

            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1.5 rounded-xl whitespace-nowrap text-xs font-semibold flex items-center gap-1.5 transition ${
                  isSelected
                    ? 'bg-red-600 text-white font-bold shadow-md shadow-red-950 scale-[1.02]'
                    : 'bg-zinc-950 text-zinc-400 hover:text-zinc-200 border border-zinc-850 hover:border-zinc-750'
                }`}
              >
                <span>{cat}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isSelected ? 'bg-red-800 text-white' : 'bg-zinc-900 text-zinc-500'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Grade de Produtos Compacta e Otimizada */}
      <div className="flex-1 overflow-y-auto p-2.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 auto-rows-max">
        {filteredProducts.length === 0 ? (
          <div className="col-span-full py-12 text-center text-zinc-500 text-xs">
            Nenhum produto encontrado para &quot;{searchQuery || selectedCategory}&quot;.
          </div>
        ) : (
          filteredProducts.map((product) => {
            const isRodizioIncluded =
              activeOrder?.isRodizio &&
              product.category !== 'Bebidas' &&
              product.category !== 'Sobremesas';

            const isExtraInRodizio =
              activeOrder?.isRodizio &&
              (product.category === 'Bebidas' || product.category === 'Sobremesas');

            const isJustAdded = justAddedId === product.id;

            return (
              <div
                key={product.id}
                onClick={() => handleAdd(product)}
                className={`p-2.5 rounded-xl border transition cursor-pointer flex flex-col justify-between select-none relative ${
                  isJustAdded
                    ? 'bg-red-950/80 border-red-500 scale-[0.98]'
                    : 'bg-zinc-950 hover:bg-zinc-850 border-zinc-800/90 hover:border-zinc-700'
                }`}
                title={`Clique para adicionar à mesa ${activeOrder?.code || 'selecionada'}`}
              >
                {/* Linha Superior: Código e Nome */}
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="bg-zinc-900 text-red-400 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border border-zinc-800 shrink-0">
                      #{product.code}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-medium truncate">
                      {product.category}
                    </span>
                  </div>

                  <h3 className="text-xs font-bold text-zinc-100 mt-1 leading-snug line-clamp-2">
                    {product.name}
                  </h3>
                </div>

                {/* Linha Inferior: Preço e Botão de Adição */}
                <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-zinc-900">
                  <div>
                    {isRodizioIncluded ? (
                      <div className="flex items-center gap-1 text-[11px] font-bold text-amber-400">
                        <Sparkles size={11} className="shrink-0" />
                        <span>R$ 0,00</span>
                        <span className="text-[9px] text-amber-500/90 font-medium">(Rodízio)</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-xs font-bold text-emerald-400">
                          R$ {product.price.toFixed(2)}
                        </span>
                        {isExtraInRodizio && (
                          <span className="text-[9px] text-zinc-500 font-medium">
                            (À parte)
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    className={`p-1 rounded-lg text-xs font-bold transition flex items-center justify-center ${
                      isJustAdded
                        ? 'bg-emerald-600 text-white'
                        : 'bg-zinc-900 hover:bg-red-600 text-zinc-300 hover:text-white'
                    }`}
                  >
                    {isJustAdded ? <Check size={12} /> : <Plus size={12} />}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
