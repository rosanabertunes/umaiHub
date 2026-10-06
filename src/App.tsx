import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { initialProducts } from './data/initialProducts';
import { 
  Plus, Printer, Trash2, Search, Utensils, CheckCircle2, 
  Minus, X, DollarSign, QrCode, CreditCard, 
  Banknote, ShoppingBag, Bike, Store, Sparkles,
  Receipt, ListPlus, Coffee, Flame, RefreshCw, FileText, CheckCheck, Clock, Save, Send,
  MessageSquare, Eye, AlertTriangle, Download,
  ShieldCheck, ShieldAlert, WifiOff, Lock, KeyRound, ServerCrash
} from 'lucide-react';
import { sendPrintJob, subscribeToLatestPrintJobs, subscribeToJobStatus, sanitizeFirestoreData } from './services/printJobService';
import { NonFiscalReceiptModal } from './components/NonFiscalReceiptModal';
import { OperatorAuthModal } from './components/OperatorAuthModal';
import { 
  initAuthListener, 
  subscribeSystemStatus, 
  getCurrentSystemStatus, 
  setPendingSyncFlag,
  SystemStatusState 
} from './services/authService';
import { NonFiscalReceipt } from './services/receiptService';
import { db } from './lib/firebase';
import { collection, doc, setDoc, onSnapshot } from 'firebase/firestore';

export type OrderType = 'Mesa' | 'Delivery' | 'Retirada' | 'Balcão';
export type OrderStatus = 'aberta' | 'conferindo' | 'fechada';
export type ProductionStatus = 'pendente' | 'enviado' | 'impresso' | 'falha';

export interface OrderItem {
  id: string;
  productId: string;
  code?: string;
  name: string;
  originalPrice: number;
  price: number;
  quantity: number;
  category: string;
  isAlaCarteExtra?: boolean;  // Porção inteira à la carte (cobrada)
  isRodizioIncluded?: boolean; // Porção degustação rodízio (R$ 0)
  printedToKitchen?: boolean;  // Compatibilidade com emissão anterior
  productionStatus?: ProductionStatus; // Status real de produção
  sector?: 'SUSHIBAR' | 'COZINHA';
  notes?: string;
}

export interface ActiveOrder {
  id: string;
  identifier: string;
  type: OrderType;
  openedAt: string;
  hasServiceTax: boolean;
  isRodizio: boolean;
  rodizioAdults: number;
  rodizioKids: number;
  items: OrderItem[];
  status?: OrderStatus;
  closedAt?: string;
  paymentMethod?: string;
  totalPaid?: number;
  productionBatch?: number;
  reprintCount?: number;
  lastReceiptJobId?: string;
  updatedAt?: string;
}

const LOCAL_STORAGE_ORDERS_KEY = 'umai_sushi_active_orders_v2';
const INITIALIZED_FLAG_KEY = 'umai_sushi_orders_initialized_v2';

/**
 * Classifica automaticamente se o prato pertence à Cozinha (quentes/fritos) ou Sushibar (frios/sushi/sashimi)
 */
export function getProductSector(category: string, name: string): 'COZINHA' | 'SUSHIBAR' {
  const cat = (category || '').toLowerCase();
  const n = (name || '').toLowerCase();
  if (
    cat.includes('quente') || 
    cat.includes('cozinha') ||
    n.includes('yakissoba') || 
    n.includes('shimeji') || 
    n.includes('guioza') || 
    n.includes('harumaki') || 
    n.includes('robata') || 
    n.includes('frito')
  ) {
    return 'COZINHA';
  }
  return 'SUSHIBAR';
}

function loadInitialOrders(): ActiveOrder[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_ORDERS_KEY);
    const initialized = localStorage.getItem(INITIALIZED_FLAG_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed; // Mesmo se vazio [], respeita remoção feita pelo operador
    }
    if (initialized) {
      return []; // Operador já apagou todas as comandas nesta sessão/computador
    }
  } catch {}

  localStorage.setItem(INITIALIZED_FLAG_KEY, 'true');
  const initial: ActiveOrder[] = [
    {
      id: 'mesa-02',
      identifier: '02',
      type: 'Mesa',
      openedAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      hasServiceTax: true,
      isRodizio: true,
      rodizioAdults: 2,
      rodizioKids: 0,
      items: [],
      productionBatch: 1,
      updatedAt: new Date().toISOString()
    }
  ];
  try {
    localStorage.setItem(LOCAL_STORAGE_ORDERS_KEY, JSON.stringify(initial));
  } catch {}
  return initial;
}

export default function App() {
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [receiptModalMode, setReceiptModalMode] = useState<'conferir_tela' | 'conferir_imprimir'>('conferir_imprimir');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isExportHelpOpen, setIsExportHelpOpen] = useState(false);
  const [systemStatus, setSystemStatus] = useState<SystemStatusState>(getCurrentSystemStatus());

  useEffect(() => {
    initAuthListener();
    const unsub = subscribeSystemStatus((st) => {
      setSystemStatus(st);
    });
    return () => unsub();
  }, []);

  const productsList = useMemo(() => {
    return Array.isArray(initialProducts) ? initialProducts : [];
  }, []);

  const [orders, setOrders] = useState<ActiveOrder[]>(loadInitialOrders);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(() => {
    const initial = loadInitialOrders();
    return initial[0]?.id || null;
  });

  // Salva no localStorage a cada alteração para imunidade completa a F5
  const persistOrders = useCallback((updated: ActiveOrder[]) => {
    setOrders(updated);
    try {
      localStorage.setItem(LOCAL_STORAGE_ORDERS_KEY, JSON.stringify(updated));
    } catch {}
  }, []);

  // Sincroniza com o Firestore em background distinguindo sucesso de falha
  const syncOrderToFirestore = useCallback(async (order: ActiveOrder): Promise<{ synced: boolean; error?: string }> => {
    try {
      const orderRef = doc(db, 'restaurants/umai-sushi/orders', order.id);
      const cleanData = sanitizeFirestoreData({ ...order, updatedAt: new Date().toISOString() });
      await setDoc(orderRef, cleanData, { merge: true });
      setPendingSyncFlag(false);
      return { synced: true };
    } catch (err: any) {
      console.warn('[FIRESTORE SYNC]', err?.message || err);
      setPendingSyncFlag(true);
      return { synced: false, error: err?.message };
    }
  }, []);

  // Escuta alterações em tempo real do Firestore sem sobrescrever edições locais mais recentes
  useEffect(() => {
    try {
      const ordersRef = collection(db, 'restaurants/umai-sushi/orders');
      const unsub = onSnapshot(ordersRef, (snapshot) => {
        if (!snapshot.empty) {
          const remoteOrders = snapshot.docs.map(d => d.data() as ActiveOrder);
          if (remoteOrders.length > 0) {
            setOrders(prev => {
              const merged = [...prev];
              remoteOrders.forEach(remote => {
                const idx = merged.findIndex(o => o.id === remote.id);
                if (idx >= 0) {
                  // Atualiza APENAS se o remoto for comprovadamente mais recente pelo timestamp
                  const localTime = merged[idx].updatedAt ? new Date(merged[idx].updatedAt!).getTime() : 0;
                  const remoteTime = remote.updatedAt ? new Date(remote.updatedAt).getTime() : 0;
                  if (remoteTime > localTime) {
                    merged[idx] = { ...merged[idx], ...remote };
                  }
                } else {
                  merged.push(remote);
                }
              });
              try {
                localStorage.setItem(LOCAL_STORAGE_ORDERS_KEY, JSON.stringify(merged));
              } catch {}
              return merged;
            });
          }
        }
      }, () => {});
      return () => unsub();
    } catch {}
  }, []);

  const [mobileTab, setMobileTab] = useState<'orders' | 'current' | 'menu'>('current');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [quickCode, setQuickCode] = useState('');
  const [activeTabSubView, setActiveTabSubView] = useState<'charged' | 'kitchen'>('charged');

  // Modais e Estados de Operação
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'PIX' | 'Cartao' | 'Dinheiro'>('PIX');
  const [orderFilterTab, setOrderFilterTab] = useState<'todas' | 'abertas' | 'fechadas'>('todas');
  const [printFeedback, setPrintFeedback] = useState<string | null>(null);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [lastPrintJobs, setLastPrintJobs] = useState<any[]>([]);

  // Estado para edição de Observação de item
  const [editingNotesItemId, setEditingNotesItemId] = useState<string | null>(null);
  const [itemNoteText, setItemNoteText] = useState<string>('');

  // Escuta os últimos jobs enviados para a fila do Firestore em tempo real
  useEffect(() => {
    try {
      const unsub = subscribeToLatestPrintJobs('umai-sushi', (jobs) => {
        setLastPrintJobs(jobs);
      });
      return () => {
        if (unsub) unsub();
      };
    } catch (e) {
      console.warn('Listener de jobs desativado no ambiente:', e);
    }
  }, []);

  // Formulário Nova Comanda
  const [newIdentifier, setNewIdentifier] = useState('');
  const [newType, setNewType] = useState<OrderType>('Mesa');
  const [newIsRodizio, setNewIsRodizio] = useState(false);
  const [newAdults, setNewAdults] = useState(1);
  const [newKids, setNewKids] = useState(0);

  const activeOrder = orders.find(o => o.id === selectedOrderId);

  // Categorias
  const categories = useMemo(() => {
    const cats = Array.from(new Set(productsList.map(p => p.category).filter(Boolean)));
    return ['Todos', ...cats];
  }, [productsList]);

  // Produtos filtrados
  const filteredProducts = useMemo(() => {
    return productsList.filter(prod => {
      const matchCat = selectedCategory === 'Todos' || prod.category === selectedCategory;
      const search = searchQuery.toLowerCase();
      const matchSearch = 
        prod.name.toLowerCase().includes(search) || 
        (prod.code && String(prod.code).toLowerCase().includes(search)) ||
        (prod.id && String(prod.id).toLowerCase().includes(search));
      return matchCat && matchSearch;
    });
  }, [productsList, selectedCategory, searchQuery]);

  // Lançamento por código
  const handleQuickCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickCode.trim() || !activeOrder) return;

    const found = productsList.find(p => 
      String(p.code) === quickCode.trim() || String(p.id) === quickCode.trim()
    );

    if (found) {
      addItemToOrder(found, false);
      setQuickCode('');
    } else {
      alert(`Código "${quickCode}" não encontrado.`);
    }
  };

  // Adicionar item à comanda (mantém o atendente na tela de lançamento)
  const addItemToOrder = (prod: any, forceAlaCarte: boolean = false) => {
    if (!activeOrder) {
      alert('Abra ou selecione uma comanda primeiro.');
      setMobileTab('orders');
      return;
    }

    const isDrinkOrDessert = ['Bebidas', 'Bebida', 'Sobremesas', 'Sobremesa'].includes(prod.category);
    // Se a mesa for rodízio, pratos normais são R$ 0, exceto se marcar como À la Carte / Extra
    const isFreeInRodizio = activeOrder.isRodizio && !isDrinkOrDessert && !forceAlaCarte;
    const itemPrice = isFreeInRodizio ? 0 : (prod.price || 0);
    const sector = getProductSector(prod.category || '', prod.name);

    const updated = orders.map(ord => {
      if (ord.id !== activeOrder.id) return ord;

      const existingIndex = ord.items.findIndex(it => 
        it.productId === String(prod.id) && it.isAlaCarteExtra === forceAlaCarte && it.isRodizioIncluded === isFreeInRodizio
      );
      
      let newItems = [...ord.items];

      if (existingIndex >= 0) {
        newItems[existingIndex] = {
          ...newItems[existingIndex],
          quantity: newItems[existingIndex].quantity + 1,
          printedToKitchen: false, // nova quantidade pendente de envio
          productionStatus: 'pendente'
        };
      } else {
        newItems.push({
          id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          productId: String(prod.id),
          code: prod.code || undefined,
          name: prod.name,
          originalPrice: Number(prod.price || 0),
          price: itemPrice,
          quantity: 1,
          category: prod.category || 'Geral',
          sector,
          isAlaCarteExtra: forceAlaCarte,
          isRodizioIncluded: isFreeInRodizio,
          printedToKitchen: false,
          productionStatus: 'pendente'
        });
      }

      const updatedOrd = { ...ord, items: newItems, updatedAt: new Date().toISOString() };
      syncOrderToFirestore(updatedOrd);
      return updatedOrd;
    });

    persistOrders(updated);
  };

  // Alternar item entre "Rodízio (R$ 0,00)" e "À la Carte (Cobrado)"
  const toggleItemPricingMode = (itemId: string) => {
    if (!activeOrder) return;
    const updated = orders.map(ord => {
      if (ord.id !== activeOrder.id) return ord;
      const updatedItems = ord.items.map(it => {
        if (it.id === itemId) {
          const newAlaCarteState = !it.isAlaCarteExtra;
          return {
            ...it,
            isAlaCarteExtra: newAlaCarteState,
            isRodizioIncluded: !newAlaCarteState,
            price: newAlaCarteState ? it.originalPrice : 0
          };
        }
        return it;
      });
      const updatedOrd = { ...ord, items: updatedItems, updatedAt: new Date().toISOString() };
      syncOrderToFirestore(updatedOrd);
      return updatedOrd;
    });
    persistOrders(updated);
  };

  // Modificar quantidade
  const updateItemQty = (itemId: string, delta: number) => {
    if (!activeOrder) return;
    const updated = orders.map(ord => {
      if (ord.id !== activeOrder.id) return ord;
      const updatedItems = ord.items
        .map(it => {
          if (it.id === itemId) {
            const nextQty = it.quantity + delta;
            return {
              ...it,
              quantity: nextQty,
              printedToKitchen: false,
              productionStatus: 'pendente' as ProductionStatus
            };
          }
          return it;
        })
        .filter(it => it.quantity > 0);
      const updatedOrd = { ...ord, items: updatedItems, updatedAt: new Date().toISOString() };
      syncOrderToFirestore(updatedOrd);
      return updatedOrd;
    });
    persistOrders(updated);
  };

  // Excluir item
  const removeItemDirectly = (itemId: string) => {
    if (!activeOrder) return;
    const updated = orders.map(ord => {
      if (ord.id !== activeOrder.id) return ord;
      const updatedOrd = { ...ord, items: ord.items.filter(it => it.id !== itemId), updatedAt: new Date().toISOString() };
      syncOrderToFirestore(updatedOrd);
      return updatedOrd;
    });
    persistOrders(updated);
  };

  // Observações em itens
  const handleOpenEditNotes = (itemId: string, currentNotes?: string) => {
    setEditingNotesItemId(itemId);
    setItemNoteText(currentNotes || '');
  };

  const handleSaveItemNotes = () => {
    if (!activeOrder || !editingNotesItemId) return;
    const updated = orders.map(ord => {
      if (ord.id !== activeOrder.id) return ord;
      const updatedItems = ord.items.map(it => 
        it.id === editingNotesItemId ? { ...it, notes: itemNoteText.trim() || undefined } : it
      );
      const updatedOrd = { ...ord, items: updatedItems, updatedAt: new Date().toISOString() };
      syncOrderToFirestore(updatedOrd);
      return updatedOrd;
    });
    persistOrders(updated);
    setEditingNotesItemId(null);
    setItemNoteText('');
  };

  // Limpar rodada da cozinha
  const clearKitchenItems = () => {
    if (!activeOrder) return;
    if (confirm('Deseja limpar os pedidos de degustação já entregues na mesa?')) {
      const updated = orders.map(ord => {
        if (ord.id !== activeOrder.id) return ord;
        const updatedOrd = { ...ord, items: ord.items.filter(it => it.price > 0), updatedAt: new Date().toISOString() };
        syncOrderToFirestore(updatedOrd);
        return updatedOrd;
      });
      persistOrders(updated);
    }
  };

  // Excluir Mesa
  const deleteActiveTable = () => {
    if (!activeOrder) return;
    if (confirm(`Excluir e cancelar o atendimento de "${activeOrder.identifier}"?`)) {
      const remaining = orders.filter(o => o.id !== activeOrder.id);
      persistOrders(remaining);
      setSelectedOrderId(remaining.length > 0 ? remaining[0].id : null);
      if (remaining.length === 0) setMobileTab('orders');
    }
  };

  // Ajustar Pessoas no Rodízio
  const updateRodizioCount = (type: 'adults' | 'kids', delta: number) => {
    if (!activeOrder) return;
    const updated = orders.map(ord => {
      if (ord.id !== activeOrder.id) return ord;
      let updatedOrd: ActiveOrder;
      if (type === 'adults') {
        updatedOrd = { ...ord, rodizioAdults: Math.max(0, ord.rodizioAdults + delta), updatedAt: new Date().toISOString() };
      } else {
        updatedOrd = { ...ord, rodizioKids: Math.max(0, ord.rodizioKids + delta), updatedAt: new Date().toISOString() };
      }
      syncOrderToFirestore(updatedOrd);
      return updatedOrd;
    });
    persistOrders(updated);
  };

  // 10% Atendimento
  const toggleServiceTax = () => {
    if (!activeOrder) return;
    const updated = orders.map(ord => {
      if (ord.id !== activeOrder.id) return ord;
      const updatedOrd = { ...ord, hasServiceTax: !ord.hasServiceTax, updatedAt: new Date().toISOString() };
      syncOrderToFirestore(updatedOrd);
      return updatedOrd;
    });
    persistOrders(updated);
  };

  // Nova Comanda
  const handleCreateOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIdentifier.trim()) return;

    const newOrd: ActiveOrder = {
      id: `ord-${Date.now()}`,
      identifier: newIdentifier.trim(),
      type: newType,
      openedAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      hasServiceTax: newType === 'Mesa',
      isRodizio: newIsRodizio,
      rodizioAdults: newIsRodizio ? Number(newAdults) : 0,
      rodizioKids: newIsRodizio ? Number(newKids) : 0,
      items: [],
      productionBatch: 1,
      updatedAt: new Date().toISOString()
    };

    const updated = [...orders, newOrd];
    persistOrders(updated);
    syncOrderToFirestore(newOrd);
    setSelectedOrderId(newOrd.id);
    setNewIdentifier('');
    setIsNewOrderModalOpen(false);
    setMobileTab('current');
  };

  // 0. SALVAR COMANDA (sem imprimir nada, com diferenciação entre local e Firestore)
  const handleSaveOrderOnly = async () => {
    if (!activeOrder) return;
    const updatedOrder: ActiveOrder = { ...activeOrder, updatedAt: new Date().toISOString() };
    const updatedList = orders.map(o => o.id === activeOrder.id ? updatedOrder : o);
    persistOrders(updatedList);
    
    setPrintFeedback('Gravando comanda...');
    const res = await syncOrderToFirestore(updatedOrder);
    if (res.synced) {
      setPrintFeedback('✓ Comanda salva neste aparelho e sincronizada no Firestore (sem impressão)');
    } else {
      const reason = systemStatus.status === 'connected' ? 'Sincronização pendente' : systemStatus.shortMessage;
      setPrintFeedback(`✓ Comanda salva com segurança NESTE APARELHO (${reason})`);
    }
    setTimeout(() => setPrintFeedback(null), 4000);
  };

  // Transmitir novos itens para a produção (Cozinha/Sushibar) com idempotência real e confirmação no Spooler
  const handleSendKitchenItems = async () => {
    if (!activeOrder) return;
    
    // Filtra apenas itens que ainda não foram confirmados como impressos
    const pendingItems = activeOrder.items.filter(it => 
      !it.printedToKitchen && it.productionStatus !== 'impresso'
    );

    if (pendingItems.length === 0) {
      setPrintFeedback('ℹ Todos os itens desta comanda já foram transmitidos à produção.');
      setTimeout(() => setPrintFeedback(null), 3500);
      return;
    }

    setIsPrinting(true);
    setPrintFeedback(`Transmitindo ${pendingItems.length} item(ns) para a produção...`);

    const currentBatch = activeOrder.productionBatch || 1;

    // Agrupa itens por setor: SUSHIBAR e COZINHA
    const sushibarItems = pendingItems.filter(it => (it.sector || getProductSector(it.category, it.name)) === 'SUSHIBAR');
    const cozinhaItems = pendingItems.filter(it => (it.sector || getProductSector(it.category, it.name)) === 'COZINHA');

    const jobsToDispatch: Array<{
      role: 'SUSHIBAR' | 'COZINHA';
      items: typeof pendingItems;
      idempotencyKey: string;
    }> = [];

    if (sushibarItems.length > 0) {
      jobsToDispatch.push({
        role: 'SUSHIBAR',
        items: sushibarItems,
        idempotencyKey: `${activeOrder.id}-prod-b${currentBatch}-sushibar`
      });
    }

    if (cozinhaItems.length > 0) {
      jobsToDispatch.push({
        role: 'COZINHA',
        items: cozinhaItems,
        idempotencyKey: `${activeOrder.id}-prod-b${currentBatch}-cozinha`
      });
    }

    const successfulRoles: string[] = [];
    const failedRoles: string[] = [];
    const successfulItemIds = new Set<string>();

    for (const job of jobsToDispatch) {
      const res = await sendPrintJob({
        restaurantId: 'umai-sushi',
        printerRole: job.role,
        printerName: 'EPSON TM-T20X Receipt',
        title: `PRODUCAO [${job.role}] [${activeOrder.identifier}] - ${job.items.length} ITENS`,
        orderIdentifier: activeOrder.identifier,
        orderType: activeOrder.type,
        documentType: 'KITCHEN_ORDER',
        isConference: false,
        idempotencyKey: job.idempotencyKey,
        items: job.items.map(it => ({
          code: it.code,
          name: it.name,
          quantity: it.quantity,
          price: it.price,
          category: it.category,
          notes: it.notes,
          isAlaCarteExtra: it.isAlaCarteExtra,
          isRodizioIncluded: it.isRodizioIncluded
        }))
      });

      if (res.success) {
        successfulRoles.push(job.role);
        job.items.forEach(it => successfulItemIds.add(it.id));

        // Escuta o status do job específico no Spooler do Windows: quando concluir, transita para 'impresso'
        const unsub = subscribeToJobStatus(res.jobId, (statusObj) => {
          if (!statusObj) return;
          if (statusObj.status === 'completed') {
            setOrders(prevOrders => {
              const ord = prevOrders.find(o => o.id === activeOrder.id);
              if (!ord) return prevOrders;
              const updatedOrd: ActiveOrder = {
                ...ord,
                updatedAt: new Date().toISOString(),
                items: ord.items.map(it => {
                  const belongs = job.items.some(ji => ji.id === it.id);
                  if (belongs) {
                    return { ...it, productionStatus: 'impresso' as ProductionStatus, printedToKitchen: true };
                  }
                  return it;
                })
              };
              const updatedList = prevOrders.map(o => o.id === activeOrder.id ? updatedOrd : o);
              try {
                localStorage.setItem(LOCAL_STORAGE_ORDERS_KEY, JSON.stringify(updatedList));
              } catch {}
              syncOrderToFirestore(updatedOrd);
              return updatedList;
            });
            unsub();
          } else if (statusObj.status === 'failed') {
            setOrders(prevOrders => {
              const ord = prevOrders.find(o => o.id === activeOrder.id);
              if (!ord) return prevOrders;
              const updatedOrd: ActiveOrder = {
                ...ord,
                updatedAt: new Date().toISOString(),
                items: ord.items.map(it => {
                  const belongs = job.items.some(ji => ji.id === it.id);
                  if (belongs) {
                    return { ...it, productionStatus: 'falha' as ProductionStatus, printedToKitchen: false };
                  }
                  return it;
                })
              };
              const updatedList = prevOrders.map(o => o.id === activeOrder.id ? updatedOrd : o);
              try {
                localStorage.setItem(LOCAL_STORAGE_ORDERS_KEY, JSON.stringify(updatedList));
              } catch {}
              return updatedList;
            });
            unsub();
          }
        });
      } else {
        failedRoles.push(job.role);
        console.error(`[FALHA DISPARO PRODUCAO] Setor ${job.role}:`, res.error);
      }
    }

    setIsPrinting(false);

    if (successfulRoles.length > 0) {
      // Pelo menos um setor foi gravado com sucesso: avança o lote e marca apenas os itens enviados
      const updatedOrder: ActiveOrder = {
        ...activeOrder,
        productionBatch: currentBatch + 1,
        updatedAt: new Date().toISOString(),
        items: activeOrder.items.map(it => 
          successfulItemIds.has(it.id)
            ? { ...it, productionStatus: 'enviado' as ProductionStatus, printedToKitchen: false }
            : it // Mantém itens dos setores que falharam intactos como 'pendente'
        )
      };

      const nextOrders = orders.map(o => o.id === activeOrder.id ? updatedOrder : o);
      persistOrders(nextOrders);
      syncOrderToFirestore(updatedOrder);

      if (failedRoles.length > 0) {
        setPrintFeedback(`✓ Enviado para ${successfulRoles.join(', ')} | ⚠ Falha em ${failedRoles.join(', ')} (itens preservados para reenvio)`);
      } else {
        setPrintFeedback(`✓ Produção transmitida para ${successfulRoles.join(' e ')} (Lote ${currentBatch})`);
      }
    } else {
      // TODOS os setores falharam: NÃO avança o lote, NÃO altera itens para 'enviado', PRESERVA tudo localmente
      setPrintFeedback(`⚠ Falha no envio para produção (${failedRoles.join(', ')}). Nenhum item foi alterado; permanecem pendentes.`);
    }
    setTimeout(() => setPrintFeedback(null), 4500);
  };

  // Envia Job de Impressão para o Print Agent de forma idempotente (sem Date.now)
  const triggerPrintJob = async (
    isConference: boolean, 
    orderToPrint: ActiveOrder, 
    customPayment?: string,
    isRePrint: boolean = false
  ) => {
    setIsPrinting(true);
    setPrintFeedback(
      isConference 
        ? 'Enviando conferência de mesa para a Epson TM-T20X...' 
        : (isRePrint ? 'Enviando reimpressão para a Epson TM-T20X...' : 'Enviando fechamento para a Epson TM-T20X...')
    );

    const chosenPayment = customPayment || paymentMethod;
    const isDiscount = chosenPayment === 'PIX' || chosenPayment === 'Dinheiro';
    const adultPrice = isDiscount ? 79.90 : 85.00;
    const kidPrice = isDiscount ? 39.90 : 42.50;

    const ordChargedItems = orderToPrint.items.filter(it => it.price > 0 || it.isAlaCarteExtra);
    const rodizioTotal = orderToPrint.isRodizio 
      ? (orderToPrint.rodizioAdults * adultPrice) + (orderToPrint.rodizioKids * kidPrice)
      : 0;
    const itemsTotal = ordChargedItems.reduce((acc, it) => acc + (it.price * it.quantity), 0);
    const subtotal = rodizioTotal + itemsTotal;
    const serviceTax = orderToPrint.hasServiceTax ? subtotal * 0.10 : 0;
    const total = subtotal + serviceTax;

    const nextCopy = isRePrint ? (orderToPrint.reprintCount || 1) + 1 : 1;
    const idempotencyKey = isRePrint 
      ? `${orderToPrint.id}-${isConference ? 'conf' : 'close'}-reprint-${nextCopy}`
      : `${orderToPrint.id}-${isConference ? 'conf' : 'close'}`;

    const res = await sendPrintJob({
      restaurantId: 'umai-sushi',
      printerRole: 'CAIXA',
      printerName: 'EPSON TM-T20X Receipt',
      title: isConference 
        ? `CONFERENCIA DE MESA [${orderToPrint.identifier}]` 
        : `FECHAMENTO [${orderToPrint.identifier}]`,
      orderIdentifier: orderToPrint.identifier,
      orderType: orderToPrint.type,
      isConference,
      isRePrint,
      copyNumber: nextCopy,
      originalJobId: orderToPrint.lastReceiptJobId,
      idempotencyKey,
      financial: {
        subtotal,
        rodizioTotal,
        itemsTotal,
        serviceTax,
        total,
        paymentMethod: chosenPayment,
        adultPrice,
        kidPrice,
        rodizioAdults: orderToPrint.rodizioAdults,
        rodizioKids: orderToPrint.rodizioKids
      },
      items: ordChargedItems.map(it => ({
        code: it.code,
        name: it.name,
        quantity: it.quantity,
        price: it.price,
        category: it.category,
        isAlaCarteExtra: it.isAlaCarteExtra
      }))
    });

    setIsPrinting(false);
    if (res.success) {
      const updatedOrder: ActiveOrder = {
        ...orderToPrint,
        lastReceiptJobId: res.jobId,
        reprintCount: nextCopy,
        updatedAt: new Date().toISOString()
      };
      const updatedList = orders.map(o => o.id === orderToPrint.id ? updatedOrder : o);
      persistOrders(updatedList);
      syncOrderToFirestore(updatedOrder);

      setPrintFeedback(
        isRePrint 
          ? `✓ Reimpressão (${nextCopy}ª via) enviada à fila da Epson (Job: ${res.jobId.slice(-6)})`
          : `✓ Cupom enviado à fila da Epson com sucesso (Job: ${res.jobId.slice(-6)})`
      );
    } else {
      setPrintFeedback(`⚠ Erro ao enviar para a fila: ${res.error || 'Falha de conexão'}`);
    }

    setTimeout(() => {
      setPrintFeedback(null);
    }, 5000);
  };

  // Reimpressão Explícita de Cupom (Nova Via)
  const handleRePrintLastJob = () => {
    if (!activeOrder) return;
    triggerPrintJob(false, activeOrder, activeOrder.paymentMethod || paymentMethod, true);
  };

  // 1. Conferência de Mesa (Pré-Conta) - NÃO apaga a mesa, apenas muda status para "conferindo" e imprime cupom
  const handlePrintConference = async () => {
    if (!activeOrder) return;

    // Atualiza status da mesa para "conferindo" preservando todos os itens
    const updated = orders.map(ord => 
      ord.id === activeOrder.id 
        ? { ...ord, status: 'conferindo' as OrderStatus } 
        : ord
    );
    persistOrders(updated);
    const activeConf = updated.find(o => o.id === activeOrder.id);
    if (activeConf) syncOrderToFirestore(activeConf);

    // Envia o job de pré-conta para a impressora física via Print Agent
    await triggerPrintJob(true, activeOrder);
  };

  // 2. Reabrir mesa caso o cliente queira pedir mais itens após conferência
  const handleReopenOrder = (orderId: string) => {
    const updated = orders.map(ord => 
      ord.id === orderId 
        ? { ...ord, status: 'aberta' as OrderStatus } 
        : ord
    );
    persistOrders(updated);
    const activeReopen = updated.find(o => o.id === orderId);
    if (activeReopen) syncOrderToFirestore(activeReopen);
    setSelectedOrderId(orderId);
  };

  // 3. Confirmar Fechamento e Pagamento da Comanda - Marca como 'fechada', imprime e arquiva (NÃO deleta)
  const handleCloseOrder = async () => {
    if (!activeOrder) return;
    const closedOrderSnapshot = { ...activeOrder };
    const closedTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    
    // Atualiza comanda como fechada mantendo todo histórico acessível
    const updated = orders.map(ord => 
      ord.id === activeOrder.id 
        ? { 
            ...ord, 
            status: 'fechada' as OrderStatus, 
            closedAt: closedTime, 
            paymentMethod,
            totalPaid: financial.total
          } 
        : ord
    );
    persistOrders(updated);
    const activeClosed = updated.find(o => o.id === activeOrder.id);
    if (activeClosed) syncOrderToFirestore(activeClosed);

    // Envia impressão de encerramento para o Print Agent
    await triggerPrintJob(false, closedOrderSnapshot, paymentMethod);
    setIsCheckoutModalOpen(false);
  };

  // 4. Excluir definitivamente da lista (caso o operador decida limpar do histórico)
  const handlePermanentlyRemoveOrder = (orderId: string) => {
    if (confirm('Deseja remover definitivamente esta comanda do histórico da sessão?')) {
      const remaining = orders.filter(o => o.id !== orderId);
      setOrders(remaining);
      if (selectedOrderId === orderId) {
        setSelectedOrderId(remaining.length > 0 ? remaining[0].id : null);
      }
    }
  };

  // Separação de itens faturáveis vs produção do rodízio
  const chargedItems = useMemo(() => {
    if (!activeOrder) return [];
    return activeOrder.items.filter(it => it.price > 0 || it.isAlaCarteExtra);
  }, [activeOrder]);

  const kitchenRodizioItems = useMemo(() => {
    if (!activeOrder) return [];
    return activeOrder.items.filter(it => it.price === 0 && !it.isAlaCarteExtra);
  }, [activeOrder]);

  // Cálculos Financeiros (PIX e Dinheiro com Desconto)
  const financial = useMemo(() => {
    if (!activeOrder) return { subtotal: 0, rodizioTotal: 0, itemsTotal: 0, serviceTax: 0, total: 0, adultPrice: 85, kidPrice: 42.5, isDiscount: false };

    const isDiscount = paymentMethod === 'PIX' || paymentMethod === 'Dinheiro';
    const adultPrice = isDiscount ? 79.90 : 85.00;
    const kidPrice = isDiscount ? 39.90 : 42.50;

    const rodizioTotal = activeOrder.isRodizio 
      ? (activeOrder.rodizioAdults * adultPrice) + (activeOrder.rodizioKids * kidPrice)
      : 0;

    const itemsTotal = chargedItems.reduce((acc, it) => acc + (it.price * it.quantity), 0);
    const subtotal = rodizioTotal + itemsTotal;
    const serviceTax = activeOrder.hasServiceTax ? subtotal * 0.10 : 0;
    const total = subtotal + serviceTax;

    return { subtotal, rodizioTotal, itemsTotal, serviceTax, total, adultPrice, kidPrice, isDiscount };
  }, [activeOrder, paymentMethod, chargedItems]);

  const getTypeIcon = (type: OrderType) => {
    switch(type) {
      case 'Mesa': return <Utensils size={14} className="text-rose-400" />;
      case 'Delivery': return <Bike size={14} className="text-amber-400" />;
      case 'Retirada': return <ShoppingBag size={14} className="text-sky-400" />;
      case 'Balcão': return <Store size={14} className="text-emerald-400" />;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 font-sans select-none overflow-hidden">
      
      {/* 1. BARRA SUPERIOR */}
      <header className="h-16 border-b border-zinc-800 bg-zinc-900/90 backdrop-blur px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-rose-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-rose-950">
            <Utensils size={22} />
          </div>
          <div>
            <h1 className="font-black text-base tracking-tight flex items-center gap-2">
              UMAI SUSHI <span className="text-[10px] bg-rose-950/80 text-rose-300 font-bold px-2 py-0.5 rounded-full border border-rose-800">SISTEMA PDV</span>
            </h1>
            <p className="text-xs text-zinc-400">Atendimento Inteligente & Caixa Rápido</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Indicador de Status Firebase / Operador */}
          <button
            onClick={() => setIsAuthModalOpen(true)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition shadow-sm border cursor-pointer ${
              systemStatus.status === 'connected'
                ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300 hover:bg-emerald-900/60'
                : systemStatus.status === 'pending_sync'
                ? 'bg-amber-950/80 border-amber-700 text-amber-300 hover:bg-amber-900'
                : systemStatus.status === 'firestore_accessible'
                ? 'bg-sky-950/70 border-sky-800 text-sky-300 hover:bg-sky-900'
                : systemStatus.status === 'no_operator_login'
                ? 'bg-sky-950/70 border-sky-800 text-sky-300 hover:bg-sky-900'
                : systemStatus.status === 'offline_network'
                ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-750'
                : 'bg-rose-950/80 border-rose-800 text-rose-300 hover:bg-rose-900'
            }`}
            title={`${systemStatus.shortMessage}: ${systemStatus.detailMessage}. Clique para gerenciar operador e conexão.`}
          >
            {systemStatus.status === 'connected' && <ShieldCheck size={14} className="text-emerald-400" />}
            {systemStatus.status === 'pending_sync' && <RefreshCw size={14} className="text-amber-400 animate-spin" />}
            {systemStatus.status === 'firestore_accessible' && <ShieldCheck size={14} className="text-sky-400" />}
            {systemStatus.status === 'no_operator_login' && <KeyRound size={14} className="text-sky-400" />}
            {systemStatus.status === 'operator_unauthorized' && <Lock size={14} className="text-rose-400" />}
            {systemStatus.status === 'auth_failed' && <ShieldAlert size={14} className="text-rose-400" />}
            {systemStatus.status === 'offline_network' && <WifiOff size={14} className="text-zinc-400" />}
            
            <span className="hidden md:inline">
              {systemStatus.status === 'connected'
                ? (systemStatus.currentUserEmail ? `Operador: ${systemStatus.currentUserEmail.split('@')[0]}` : 'Nuvem Conectada')
                : systemStatus.shortMessage}
            </span>
            <span className="md:hidden">
              {systemStatus.status === 'connected' ? 'Nuvem OK' : systemStatus.shortMessage}
            </span>
          </button>

          {/* Botão de Ajuda para Exportar Código / Print Agent */}
          <button
            onClick={() => setIsExportHelpOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
            title="Como baixar os arquivos do Print Agent no notebook"
          >
            <Download size={14} className="text-zinc-400" />
            <span className="hidden sm:inline">Exportar Agente</span>
          </button>

          {/* Indicador Oficial de Impressão: Fila Firestore & Print Agent Windows */}
          <div className="flex items-center gap-2 px-3.5 py-2 bg-zinc-950/80 border border-zinc-800 rounded-xl text-xs font-bold shadow-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <Printer size={15} className="text-emerald-400" />
            <span className="text-zinc-300 hidden sm:inline">Epson TM-T20X:</span>
            <span className="text-emerald-400 font-mono">Fila Windows Spooler</span>
            {lastPrintJobs.length > 0 && (
              <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                lastPrintJobs[0].status === 'completed'
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  : lastPrintJobs[0].status === 'pending'
                  ? 'bg-amber-950 text-amber-300 border border-amber-800 animate-pulse'
                  : lastPrintJobs[0].status === 'processing'
                  ? 'bg-sky-950 text-sky-300 border border-sky-800 animate-pulse'
                  : 'bg-rose-950 text-rose-300 border border-rose-800'
              }`}>
                {lastPrintJobs[0].status === 'completed' ? 'Spooler OK' : lastPrintJobs[0].status}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* 2. NAVEGADOR MOBILE */}
      <nav className="md:hidden flex border-b border-zinc-800 bg-zinc-900 shrink-0 text-xs font-bold">
        <button
          onClick={() => setMobileTab('orders')}
          className={`flex-1 py-3 flex items-center justify-center gap-1.5 border-b-2 transition ${
            mobileTab === 'orders' ? 'border-rose-500 text-rose-400 bg-zinc-800/50' : 'border-transparent text-zinc-400'
          }`}
        >
          <Receipt size={16} /> Comandas ({orders.length})
        </button>
        <button
          onClick={() => setMobileTab('current')}
          className={`flex-1 py-3 flex items-center justify-center gap-1.5 border-b-2 transition ${
            mobileTab === 'current' ? 'border-rose-500 text-rose-400 bg-zinc-800/50' : 'border-transparent text-zinc-400'
          }`}
        >
          <Utensils size={16} /> Mesa {activeOrder ? `(${activeOrder.identifier})` : ''}
        </button>
        <button
          onClick={() => setMobileTab('menu')}
          className={`flex-1 py-3 flex items-center justify-center gap-1.5 border-b-2 transition ${
            mobileTab === 'menu' ? 'border-rose-500 text-rose-400 bg-zinc-800/50' : 'border-transparent text-zinc-400'
          }`}
        >
          <ListPlus size={16} /> Cardápio
        </button>
      </nav>

      {/* 3. CORPO PRINCIPAL */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* COLUNA 1: COMANDAS */}
        <aside className={`w-full md:w-72 lg:w-80 border-r border-zinc-800 bg-zinc-900/60 flex flex-col shrink-0 ${
          mobileTab === 'orders' ? 'flex' : 'hidden md:flex'
        }`}>
          <div className="p-3.5 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/40">
            <div>
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Atendimentos</span>
              <p className="text-[11px] text-zinc-500 font-medium">
                {orders.filter(o => o.status !== 'fechada').length} comanda(s) ativas
              </p>
            </div>
            <button
              onClick={() => setIsNewOrderModalOpen(true)}
              className="bg-rose-600 hover:bg-rose-500 active:scale-95 text-white px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-rose-950 transition"
            >
              <Plus size={16} /> Abrir Nova
            </button>
          </div>

          {/* Abas de Filtro de Status das Comandas */}
          <div className="flex border-b border-zinc-800 bg-zinc-950/60 p-1.5 gap-1 text-[11px] font-bold">
            <button
              onClick={() => setOrderFilterTab('todas')}
              className={`flex-1 py-1.5 rounded-lg transition text-center ${
                orderFilterTab === 'todas'
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Todas ({orders.length})
            </button>
            <button
              onClick={() => setOrderFilterTab('abertas')}
              className={`flex-1 py-1.5 rounded-lg transition text-center ${
                orderFilterTab === 'abertas'
                  ? 'bg-rose-950/80 text-rose-300 border border-rose-800/80 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Abertas ({orders.filter(o => o.status !== 'fechada').length})
            </button>
            <button
              onClick={() => setOrderFilterTab('fechadas')}
              className={`flex-1 py-1.5 rounded-lg transition text-center ${
                orderFilterTab === 'fechadas'
                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Pagas ({orders.filter(o => o.status === 'fechada').length})
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {orders.filter(ord => {
              if (orderFilterTab === 'abertas') return ord.status !== 'fechada';
              if (orderFilterTab === 'fechadas') return ord.status === 'fechada';
              return true;
            }).length === 0 ? (
              <div className="text-center py-16 px-4">
                <Coffee size={36} className="mx-auto text-zinc-600 mb-2 opacity-50" />
                <p className="text-xs font-bold text-zinc-400">Nenhuma comanda neste filtro</p>
              </div>
            ) : (
              orders
                .filter(ord => {
                  if (orderFilterTab === 'abertas') return ord.status !== 'fechada';
                  if (orderFilterTab === 'fechadas') return ord.status === 'fechada';
                  return true;
                })
                .map(ord => {
                  const isSelected = selectedOrderId === ord.id;
                  const isClosed = ord.status === 'fechada';
                  const isChecking = ord.status === 'conferindo';

                  return (
                    <div
                      key={ord.id}
                      onClick={() => {
                        setSelectedOrderId(ord.id);
                        setMobileTab('current');
                      }}
                      className={`p-3.5 rounded-2xl cursor-pointer border transition-all flex flex-col gap-2 ${
                        isSelected
                          ? isClosed
                            ? 'bg-zinc-850 border-emerald-500 shadow-lg ring-1 ring-emerald-500'
                            : isChecking
                            ? 'bg-zinc-850 border-amber-500 shadow-lg ring-1 ring-amber-500'
                            : 'bg-zinc-800/90 border-rose-500 shadow-lg shadow-rose-950/30 ring-1 ring-rose-500'
                          : isClosed
                          ? 'bg-zinc-900/60 border-zinc-850 hover:border-zinc-700 opacity-80'
                          : isChecking
                          ? 'bg-amber-950/20 border-amber-800/60 hover:border-amber-700'
                          : 'bg-zinc-900/90 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-850'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="p-1.5 rounded-lg bg-zinc-950 border border-zinc-800">
                            {getTypeIcon(ord.type)}
                          </span>
                          <span className="font-black text-base text-zinc-100">{ord.identifier}</span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {isClosed ? (
                            <span className="text-[10px] font-bold text-emerald-300 bg-emerald-950 border border-emerald-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <CheckCheck size={11} /> PAGA
                            </span>
                          ) : isChecking ? (
                            <span className="text-[10px] font-bold text-amber-300 bg-amber-950 border border-amber-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <Clock size={11} /> CONFERINDO
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded-full border border-zinc-800">
                              {ord.type}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-between items-center text-xs pt-1 border-t border-zinc-800/50">
                        <div className="flex items-center gap-1 text-zinc-400">
                          {ord.isRodizio ? (
                            <span className="text-rose-400 font-bold flex items-center gap-1">
                              <Sparkles size={12} /> Rodízio ({ord.rodizioAdults + ord.rodizioKids}p)
                            </span>
                          ) : (
                            <span>{ord.items.filter(i => i.price > 0).length} itens faturados</span>
                          )}
                        </div>
                        <span className="text-[11px] text-zinc-500 font-mono">
                          {isClosed ? `Fechada ${ord.closedAt || ''}` : ord.openedAt}
                        </span>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </aside>

        {/* COLUNA 2: COMANDA ATIVA */}
        <section className={`w-full md:w-96 lg:w-[450px] border-r border-zinc-800 bg-zinc-900 flex flex-col shrink-0 ${
          mobileTab === 'current' ? 'flex' : 'hidden md:flex'
        }`}>
          {activeOrder ? (
            <>
              {/* Header da Mesa */}
              <div className="p-4 border-b border-zinc-800 bg-zinc-900/90 space-y-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="p-2 rounded-xl bg-zinc-950 border border-zinc-800">
                      {getTypeIcon(activeOrder.type)}
                    </span>
                    <div>
                      <h2 className="text-xl font-black text-white leading-none">{activeOrder.identifier}</h2>
                      <p className="text-[11px] text-zinc-400 mt-1">{activeOrder.type} • Aberta às {activeOrder.openedAt}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={toggleServiceTax}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition ${
                        activeOrder.hasServiceTax
                          ? 'bg-amber-950/70 border-amber-500 text-amber-300 shadow-sm'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-500'
                      }`}
                    >
                      10% {activeOrder.hasServiceTax ? 'LIGADO' : 'NÃO'}
                    </button>

                    <button
                      onClick={deleteActiveTable}
                      title="Cancelar/Excluir Comanda"
                      className="p-2 bg-zinc-800 hover:bg-rose-950 text-zinc-400 hover:text-rose-400 rounded-xl border border-zinc-700 transition"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Bloco de Rodízio */}
                {activeOrder.isRodizio && (
                  <div className="bg-zinc-950 p-3 rounded-2xl border border-zinc-800 space-y-2.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-extrabold text-rose-400 flex items-center gap-1.5">
                        <Sparkles size={14} /> MODO RODÍZIO ATIVO
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-zinc-900 p-2.5 rounded-xl border border-zinc-800 flex justify-between items-center">
                        <div>
                          <p className="font-bold text-xs text-zinc-200">Adultos</p>
                          <p className="text-[10px] text-zinc-400 font-mono">R$ {financial.adultPrice.toFixed(2)}</p>
                        </div>
                        <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
                          <button onClick={() => updateRodizioCount('adults', -1)} className="p-1 rounded bg-zinc-800 text-zinc-300"><Minus size={12} /></button>
                          <span className="font-mono font-black text-xs w-5 text-center">{activeOrder.rodizioAdults}</span>
                          <button onClick={() => updateRodizioCount('adults', 1)} className="p-1 rounded bg-zinc-800 text-zinc-300"><Plus size={12} /></button>
                        </div>
                      </div>

                      <div className="bg-zinc-900 p-2.5 rounded-xl border border-zinc-800 flex justify-between items-center">
                        <div>
                          <p className="font-bold text-xs text-zinc-200">Crianças</p>
                          <p className="text-[10px] text-zinc-400 font-mono">R$ {financial.kidPrice.toFixed(2)}</p>
                        </div>
                        <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
                          <button onClick={() => updateRodizioCount('kids', -1)} className="p-1 rounded bg-zinc-800 text-zinc-300"><Minus size={12} /></button>
                          <span className="font-mono font-black text-xs w-5 text-center">{activeOrder.rodizioKids}</span>
                          <button onClick={() => updateRodizioCount('kids', 1)} className="p-1 rounded bg-zinc-800 text-zinc-300"><Plus size={12} /></button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ABAS DA COMANDA: ITENS FATURADOS vs PEDIDOS DO SUSHIBAR */}
              <div className="flex border-b border-zinc-800 bg-zinc-900/60 text-xs font-bold px-3 pt-2 gap-2">
                <button
                  onClick={() => setActiveTabSubView('charged')}
                  className={`pb-2 px-3 border-b-2 flex items-center gap-1.5 transition ${
                    activeTabSubView === 'charged'
                      ? 'border-emerald-500 text-emerald-400'
                      : 'border-transparent text-zinc-400 hover:text-zinc-300'
                  }`}
                >
                  <DollarSign size={14} /> Itens da Conta ({chargedItems.length})
                </button>

                {activeOrder.isRodizio && (
                  <button
                    onClick={() => setActiveTabSubView('kitchen')}
                    className={`pb-2 px-3 border-b-2 flex items-center gap-1.5 transition ${
                      activeTabSubView === 'kitchen'
                        ? 'border-rose-500 text-rose-400'
                        : 'border-transparent text-zinc-400 hover:text-zinc-300'
                    }`}
                  >
                    <Flame size={14} /> Pedidos Sushibar ({kitchenRodizioItems.reduce((a,b)=>a+b.quantity,0)})
                  </button>
                )}
              </div>

              {/* LISTA DE ITENS */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                
                {/* 1. VISÃO DE ITENS COBRADOS NA CONTA (À la carte / Extras / Bebidas) */}
                {activeTabSubView === 'charged' && (
                  <>
                    {chargedItems.length === 0 ? (
                      <div className="text-center py-12 px-4 bg-zinc-950/40 rounded-2xl border border-dashed border-zinc-800">
                        <ShoppingBag size={28} className="mx-auto text-zinc-600 mb-2 opacity-60" />
                        <p className="text-xs font-bold text-zinc-400">Nenhuma porção extra ou bebida faturada</p>
                        <p className="text-[11px] text-zinc-500 mt-1">Porções À la Carte inteiras e bebidas aparecem aqui.</p>
                      </div>
                    ) : (
                      chargedItems.map(it => {
                        const itemSector = it.sector || getProductSector(it.category, it.name);
                        return (
                          <div key={it.id} className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800 flex flex-col gap-1.5 shadow-sm">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="font-bold text-xs text-zinc-200 truncate">{it.name}</p>
                                  {it.isAlaCarteExtra && (
                                    <span className="text-[9px] bg-amber-950 text-amber-300 font-bold px-1.5 py-0.5 rounded border border-amber-800">
                                      À la Carte
                                    </span>
                                  )}
                                  <span className="text-[9px] bg-zinc-900 text-zinc-400 font-mono px-1 rounded border border-zinc-800">
                                    {itemSector}
                                  </span>
                                  {/* Status real de produção */}
                                  {it.productionStatus === 'impresso' || it.printedToKitchen ? (
                                    <span className="text-[9px] text-emerald-400 bg-emerald-950/80 border border-emerald-800 px-1.5 py-0.5 rounded font-bold">
                                      ✓ Impresso
                                    </span>
                                  ) : it.productionStatus === 'enviado' ? (
                                    <span className="text-[9px] text-sky-400 bg-sky-950/80 border border-sky-800 px-1.5 py-0.5 rounded font-bold animate-pulse">
                                      Na fila...
                                    </span>
                                  ) : it.productionStatus === 'falha' ? (
                                    <span className="text-[9px] text-rose-400 bg-rose-950/80 border border-rose-800 px-1.5 py-0.5 rounded font-bold">
                                      ⚠ Falha
                                    </span>
                                  ) : (
                                    <span className="text-[9px] text-amber-400 bg-amber-950/80 border border-amber-800 px-1.5 py-0.5 rounded font-bold">
                                      Pendente
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
                                  R$ {it.price.toFixed(2)} un
                                </p>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <span className="font-mono font-bold text-xs text-emerald-400">
                                  R$ {(it.price * it.quantity).toFixed(2)}
                                </span>

                                <div className="flex items-center gap-1 bg-zinc-900 p-0.5 rounded-lg border border-zinc-800">
                                  <button onClick={() => updateItemQty(it.id, -1)} className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-rose-400"><Minus size={12} /></button>
                                  <span className="font-mono font-bold text-xs w-4 text-center">{it.quantity}</span>
                                  <button onClick={() => updateItemQty(it.id, 1)} className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-emerald-400"><Plus size={12} /></button>
                                </div>

                                {activeOrder.isRodizio && it.isAlaCarteExtra && (
                                  <button
                                    onClick={() => toggleItemPricingMode(it.id)}
                                    title="Mudar para porção degustação de Rodízio (R$ 0,00)"
                                    className="text-[10px] bg-zinc-900 hover:bg-zinc-800 text-zinc-400 px-1.5 py-1 rounded border border-zinc-800"
                                  >
                                    P/ Rodízio
                                  </button>
                                )}

                                <button
                                  onClick={() => removeItemDirectly(it.id)}
                                  className="p-1 text-zinc-600 hover:text-rose-400 rounded-lg"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>

                            {/* Observação e Botão de Adicionar/Editar Observação */}
                            <div className="flex items-center justify-between pt-1 border-t border-zinc-900 text-[10px]">
                              {it.notes ? (
                                <p className="text-amber-300 font-medium bg-amber-950/40 border border-amber-900/40 px-2 py-0.5 rounded-lg truncate max-w-[220px]">
                                  Obs: {it.notes}
                                </p>
                              ) : (
                                <span className="text-zinc-600 italic">Sem observações</span>
                              )}
                              <button
                                type="button"
                                onClick={() => handleOpenEditNotes(it.id, it.notes)}
                                className="text-zinc-400 hover:text-amber-300 font-medium flex items-center gap-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 px-2 py-0.5 rounded transition"
                              >
                                <MessageSquare size={11} />
                                <span>{it.notes ? 'Alterar Obs' : '+ Obs'}</span>
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </>
                )}

                {/* 2. VISÃO DE PRODUÇÃO DO SUSHIBAR (DEGUSTAÇÃO RODÍZIO R$ 0,00) */}
                {activeTabSubView === 'kitchen' && activeOrder.isRodizio && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center px-1">
                      <span className="text-[11px] font-bold text-rose-400">Porções Degustação em Preparo</span>
                      {kitchenRodizioItems.length > 0 && (
                        <button
                          onClick={clearKitchenItems}
                          className="text-[10px] text-zinc-500 hover:text-rose-400 underline font-medium"
                        >
                          Limpar Rodada
                        </button>
                      )}
                    </div>

                    {kitchenRodizioItems.length === 0 ? (
                      <div className="text-center py-10 text-zinc-600 text-xs">
                        Nenhum pedido de degustação lançado nesta mesa ainda.
                      </div>
                    ) : (
                      kitchenRodizioItems.map(it => {
                        const itemSector = it.sector || getProductSector(it.category, it.name);
                        return (
                          <div key={it.id} className="bg-zinc-950/80 p-2.5 rounded-xl border border-zinc-850 flex flex-col gap-1 text-xs">
                            <div className="flex items-center justify-between">
                              <div className="flex-1 pr-2">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="font-bold text-zinc-300">{it.name}</p>
                                  <span className="text-[9px] bg-zinc-900 text-zinc-400 font-mono px-1 rounded border border-zinc-800">
                                    {itemSector}
                                  </span>
                                  {it.productionStatus === 'impresso' || it.printedToKitchen ? (
                                    <span className="text-[9px] text-emerald-400 bg-emerald-950/80 border border-emerald-800 px-1.5 py-0.5 rounded font-bold">
                                      ✓ Impresso
                                    </span>
                                  ) : it.productionStatus === 'enviado' ? (
                                    <span className="text-[9px] text-sky-400 bg-sky-950/80 border border-sky-800 px-1.5 py-0.5 rounded font-bold animate-pulse">
                                      Na fila...
                                    </span>
                                  ) : it.productionStatus === 'falha' ? (
                                    <span className="text-[9px] text-rose-400 bg-rose-950/80 border border-rose-800 px-1.5 py-0.5 rounded font-bold">
                                      ⚠ Falha
                                    </span>
                                  ) : (
                                    <span className="text-[9px] text-amber-400 bg-amber-950/80 border border-amber-800 px-1.5 py-0.5 rounded font-bold">
                                      Pendente
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-emerald-400 font-semibold block mt-0.5">Incluso no Rodízio (R$ 0,00)</span>
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => toggleItemPricingMode(it.id)}
                                  title="Cobrar este item como porção inteira À la Carte"
                                  className="text-[10px] bg-amber-950 text-amber-300 border border-amber-800 px-2 py-1 rounded-lg font-bold hover:bg-amber-900 transition"
                                >
                                  + À la Carte (R$ {it.originalPrice.toFixed(2)})
                                </button>

                                <div className="flex items-center gap-1 bg-zinc-900 p-0.5 rounded-lg border border-zinc-800">
                                  <button onClick={() => updateItemQty(it.id, -1)} className="p-1 hover:text-rose-400"><Minus size={12} /></button>
                                  <span className="font-mono font-bold text-xs w-4 text-center">{it.quantity}</span>
                                  <button onClick={() => updateItemQty(it.id, 1)} className="p-1 hover:text-emerald-400"><Plus size={12} /></button>
                                </div>

                                <button onClick={() => removeItemDirectly(it.id)} className="p-1 text-zinc-600 hover:text-rose-400">
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>

                            {/* Observação */}
                            <div className="flex items-center justify-between pt-1 border-t border-zinc-900 text-[10px]">
                              {it.notes ? (
                                <p className="text-amber-300 font-medium bg-amber-950/40 border border-amber-900/40 px-2 py-0.5 rounded-lg truncate max-w-[220px]">
                                  Obs: {it.notes}
                                </p>
                              ) : (
                                <span className="text-zinc-600 italic">Sem observações</span>
                              )}
                              <button
                                type="button"
                                onClick={() => handleOpenEditNotes(it.id, it.notes)}
                                className="text-zinc-400 hover:text-amber-300 font-medium flex items-center gap-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 px-2 py-0.5 rounded transition"
                              >
                                <MessageSquare size={11} />
                                <span>{it.notes ? 'Alterar Obs' : '+ Obs'}</span>
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

              </div>

              {/* Totalizador & Ações da Mesa (com shrink-0 para não espremer em notebook) */}
              <div className="p-3 border-t border-zinc-800 bg-zinc-950 space-y-2 shrink-0">
                {/* Feedback de Impressão */}
                {printFeedback && (
                  <div className={`p-2.5 rounded-xl text-xs font-bold border flex items-center gap-2 transition ${
                    printFeedback.includes('✓')
                      ? 'bg-emerald-950/80 border-emerald-700 text-emerald-300'
                      : 'bg-amber-950/80 border-amber-700 text-amber-300'
                  }`}>
                    <Printer size={15} className="shrink-0 animate-pulse" />
                    <span className="truncate">{printFeedback}</span>
                  </div>
                )}

                <div className="space-y-1 text-xs">
                  <div className="flex justify-between text-zinc-400 font-medium">
                    <span>Subtotal:</span>
                    <span className="font-mono text-zinc-200">R$ {financial.subtotal.toFixed(2)}</span>
                  </div>
                  {activeOrder.hasServiceTax && (
                    <div className="flex justify-between text-amber-400 font-medium">
                      <span>Taxa de Atendimento (10%):</span>
                      <span className="font-mono">R$ {financial.serviceTax.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-black text-white pt-1 border-t border-zinc-800">
                    <span>TOTAL:</span>
                    <span className="font-mono text-emerald-400">R$ {financial.total.toFixed(2)}</span>
                  </div>
                </div>

                {/* Botões de Ação de Mesa */}
                {activeOrder.status === 'fechada' ? (
                  <div className="space-y-2 pt-1">
                    <div className="p-2.5 bg-emerald-950/50 border border-emerald-800 rounded-xl text-center">
                      <p className="text-xs font-black text-emerald-300 flex items-center justify-center gap-1.5">
                        <CheckCheck size={15} /> Comanda Paga & Finalizada ({activeOrder.paymentMethod})
                      </p>
                      <p className="text-[11px] text-zinc-400 mt-0.5 font-mono">
                        Fechada às {activeOrder.closedAt || ''} • Total: R$ {(activeOrder.totalPaid || financial.total).toFixed(2)}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          setReceiptModalMode('conferir_tela');
                          setIsReceiptModalOpen(true);
                        }}
                        className="bg-zinc-800 hover:bg-zinc-700 active:scale-98 text-zinc-200 font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 border border-zinc-700 transition"
                      >
                        <Eye size={13} /> Conferir na Tela
                      </button>

                      <button
                        onClick={handleRePrintLastJob}
                        disabled={isPrinting}
                        className="bg-amber-600 hover:bg-amber-500 active:scale-98 text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-950 transition"
                      >
                        <RefreshCw size={13} className={isPrinting ? 'animate-spin' : ''} />
                        <span>Reimprimir Cupom</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-0.5">
                      <button
                        onClick={() => handleReopenOrder(activeOrder.id)}
                        className="bg-zinc-900 hover:bg-zinc-800 text-amber-300 font-bold py-1.5 rounded-xl text-xs flex items-center justify-center gap-1.5 border border-amber-800/60 transition"
                      >
                        <RefreshCw size={12} /> Reabrir Mesa
                      </button>

                      <button
                        onClick={() => handlePermanentlyRemoveOrder(activeOrder.id)}
                        className="text-zinc-500 hover:text-rose-400 font-medium py-1.5 text-[11px] transition flex items-center justify-center gap-1"
                      >
                        <Trash2 size={12} /> Remover
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5 pt-1">
                    {/* Linha 1: SALVAR (Sem Imprimir) & Enviar Produção (Cozinha/Sushibar) */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={handleSaveOrderOnly}
                        className="bg-zinc-800 hover:bg-zinc-700 active:scale-98 text-zinc-200 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 border border-zinc-700 transition"
                        title="Salva a comanda no banco de dados sem enviar para a impressora"
                      >
                        <Save size={14} className="text-zinc-400" />
                        <span>SALVAR</span>
                      </button>

                      <button
                        onClick={handleSendKitchenItems}
                        disabled={isPrinting}
                        className={`font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 border transition active:scale-98 ${
                          activeOrder.items.some(it => !it.printedToKitchen && it.productionStatus !== 'impresso')
                            ? 'bg-rose-950 hover:bg-rose-900 border-rose-700 text-rose-300 shadow-md shadow-rose-950'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-400'
                        }`}
                        title="Transmite somente itens ainda não enviados para a produção"
                      >
                        <Send size={14} className={isPrinting ? 'animate-spin' : ''} />
                        <span>Enviar Produção</span>
                        {activeOrder.items.filter(it => !it.printedToKitchen && it.productionStatus !== 'impresso').length > 0 && (
                          <span className="bg-rose-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-mono font-black">
                            {activeOrder.items.filter(it => !it.printedToKitchen && it.productionStatus !== 'impresso').length}
                          </span>
                        )}
                      </button>
                    </div>

                    {/* Linha 2: Conferir na Tela & Conferir e Imprimir */}
                    <div className="grid grid-cols-2 gap-2">
                      {/* Conferir na Tela (Apenas mostra a revisão) */}
                      <button
                        onClick={() => {
                          setReceiptModalMode('conferir_tela');
                          setIsReceiptModalOpen(true);
                        }}
                        className="bg-amber-950/70 hover:bg-amber-900/80 border border-amber-800/80 text-amber-300 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition active:scale-98"
                        title="Apenas mostra a revisão do cupom na tela sem imprimir"
                      >
                        <Eye size={14} />
                        <span>Conferir na Tela</span>
                      </button>

                      {/* Conferir e Imprimir (Solicita o cupom não fiscal) */}
                      <button
                        onClick={() => {
                          setReceiptModalMode('conferir_imprimir');
                          setIsReceiptModalOpen(true);
                        }}
                        className="bg-amber-600 hover:bg-amber-500 active:scale-98 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-950 transition"
                        title="Solicita a impressão do cupom não fiscal"
                      >
                        <Printer size={14} />
                        <span>Conferir e Imprimir</span>
                      </button>
                    </div>

                    {/* Linha 3: Fechar Mesa (Registra pagamento sem apagar comanda) */}
                    <button
                      onClick={() => setIsCheckoutModalOpen(true)}
                      disabled={isPrinting}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-black py-2.5 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-emerald-950 transition"
                      title="Registra o pagamento e fecha a mesa sem apagar a comanda"
                    >
                      <DollarSign size={16} />
                      <span>Fechar Mesa</span>
                    </button>

                    {/* Linha 4: Reimprimir se já emitida via prévia */}
                    {(activeOrder.lastReceiptJobId || (activeOrder.reprintCount && activeOrder.reprintCount > 0)) && (
                      <button
                        onClick={handleRePrintLastJob}
                        disabled={isPrinting}
                        className="w-full bg-zinc-900 hover:bg-zinc-800 text-amber-300 border border-amber-800/50 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition"
                      >
                        <RefreshCw size={12} className={isPrinting ? 'animate-spin' : ''} />
                        <span>Reimprimir Cupom (Nova Via / {(activeOrder.reprintCount || 1) + 1}ª Via)</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <Utensils size={40} className="text-zinc-700 mb-3 opacity-40" />
              <p className="text-sm font-bold text-zinc-400">Nenhuma comanda selecionada</p>
            </div>
          )}
        </section>

        {/* COLUNA 3: CARDÁPIO */}
        <main className={`flex-1 flex flex-col bg-zinc-950 ${
          mobileTab === 'menu' ? 'flex' : 'hidden md:flex'
        }`}>
          
          {/* Busca */}
          <div className="p-3.5 border-b border-zinc-800 bg-zinc-900/60 flex gap-2.5 items-center shrink-0">
            <form onSubmit={handleQuickCodeSubmit} className="w-36 md:w-44 shrink-0">
              <input
                type="text"
                placeholder="Cód (101) + ↵"
                value={quickCode}
                onChange={e => setQuickCode(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2 rounded-xl text-xs font-mono font-bold text-white placeholder-zinc-500 focus:outline-none focus:border-rose-500"
              />
            </form>

            <div className="relative flex-1">
              <Search size={16} className="absolute left-3.5 top-2.5 text-zinc-500" />
              <input
                type="text"
                placeholder="Buscar sushi, temaki, bebida..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 pl-10 pr-4 py-2 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-rose-500"
              />
            </div>
          </div>

          {/* Categorias */}
          <div className="px-3.5 py-2.5 border-b border-zinc-800 bg-zinc-900/30 flex gap-2 overflow-x-auto shrink-0 scrollbar-none">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                  selectedCategory === cat
                    ? 'bg-rose-600 text-white shadow-md shadow-rose-950'
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Grid de Cards do Cardápio */}
          <div className="flex-1 overflow-y-auto p-3.5">
            {filteredProducts.length === 0 ? (
              <div className="text-center py-20 text-xs text-zinc-500">
                Nenhum produto encontrado.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
                {filteredProducts.map(prod => {
                  const isDrinkOrDessert = ['Bebidas', 'Bebida', 'Sobremesas', 'Sobremesa'].includes(prod.category);
                  const isRodizioTable = activeOrder?.isRodizio;
                  const countInOrder = activeOrder?.items
                    .filter(it => it.productId === String(prod.id))
                    .reduce((acc, it) => acc + it.quantity, 0) || 0;

                  return (
                    <div
                      key={prod.id}
                      className={`bg-zinc-900/90 border p-3 rounded-2xl transition-all flex flex-col justify-between shadow-sm ${
                        countInOrder > 0 ? 'border-rose-600/70 ring-1 ring-rose-600/30' : 'border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <div>
                        <div className="flex justify-between items-center text-[10px] text-zinc-400 mb-1.5">
                          <span className="font-mono font-bold bg-zinc-950 px-1.5 py-0.5 rounded-md border border-zinc-800 text-zinc-300">
                            #{prod.code || prod.id}
                          </span>
                          <div className="flex items-center gap-1">
                            <span className="truncate max-w-[80px] font-medium text-zinc-500">{prod.category}</span>
                            {countInOrder > 0 && (
                              <span className="bg-rose-600 text-white font-mono font-black text-[9px] px-1.5 py-0.5 rounded-full shadow">
                                {countInOrder}x
                              </span>
                            )}
                          </div>
                        </div>
                        <h4 className="font-bold text-xs text-zinc-200 leading-snug line-clamp-2">
                          {prod.name}
                        </h4>
                      </div>

                      <div className="mt-3 pt-2 border-t border-zinc-800/60 space-y-1.5">
                        <div className="flex justify-between items-center">
                          <span className="font-black font-mono text-xs text-emerald-400">
                            R$ {Number(prod.price || 0).toFixed(2)}
                          </span>
                          {countInOrder > 0 && (
                            <div className="flex items-center gap-1 bg-zinc-950 px-1.5 py-0.5 rounded-lg border border-zinc-800">
                              <button
                                type="button"
                                onClick={() => {
                                  const it = activeOrder?.items.find(i => i.productId === String(prod.id));
                                  if (it) updateItemQty(it.id, -1);
                                }}
                                className="p-0.5 text-zinc-400 hover:text-rose-400 rounded"
                                title="Reduzir 1 unidade"
                              >
                                <Minus size={11} />
                              </button>
                              <span className="font-mono font-bold text-[10px] text-white px-1">{countInOrder}</span>
                              <button
                                type="button"
                                onClick={() => addItemToOrder(prod, false)}
                                className="p-0.5 text-zinc-400 hover:text-emerald-400 rounded"
                                title="Adicionar mais 1"
                              >
                                <Plus size={11} />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Botões Didáticos: Degustação Rodízio vs Porção À la Carte (sem sair da tela) */}
                        {isRodizioTable && !isDrinkOrDessert ? (
                          <div className="grid grid-cols-2 gap-1 pt-1">
                            <button
                              type="button"
                              onClick={() => addItemToOrder(prod, false)}
                              className="bg-rose-950/90 hover:bg-rose-600 active:scale-95 text-rose-300 hover:text-white py-1.5 px-1.5 rounded-lg text-[10px] font-bold border border-rose-900/50 transition text-center"
                              title="Lançar degustação de rodízio (R$ 0,00)"
                            >
                              🥢 Rodízio (R$0)
                            </button>
                            <button
                              type="button"
                              onClick={() => addItemToOrder(prod, true)}
                              className="bg-amber-950 hover:bg-amber-600 active:scale-95 text-amber-300 hover:text-white py-1.5 px-1.5 rounded-lg text-[10px] font-bold border border-amber-800 transition text-center"
                              title="Lançar porção inteira À la Carte (cobrado)"
                            >
                              💰 À la Carte
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => addItemToOrder(prod, false)}
                            className="w-full bg-rose-950/80 text-rose-300 hover:bg-rose-600 active:scale-95 hover:text-white py-1.5 rounded-lg text-xs font-bold border border-rose-900/50 transition"
                          >
                            + Lançar {countInOrder > 0 ? `(+1)` : ''}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Barra Flutuante Mobile: Resumo do Atendimento ao Navegar no Cardápio */}
          {mobileTab === 'menu' && activeOrder && (
            <div className="md:hidden fixed bottom-0 left-0 right-0 bg-zinc-900/95 backdrop-blur-md border-t border-zinc-800 p-2.5 px-4 flex items-center justify-between z-30 shadow-2xl">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-xs bg-zinc-950 px-2 py-1 rounded-lg border border-zinc-800 text-rose-400">
                  {activeOrder.type} {activeOrder.identifier}
                </span>
                <span className="text-xs text-zinc-300 font-bold">
                  {activeOrder.items.length} itens • <span className="text-emerald-400 font-mono">R$ {financial.total.toFixed(2)}</span>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileTab('current')}
                className="bg-rose-600 hover:bg-rose-500 text-white px-3.5 py-1.5 rounded-xl text-xs font-black shadow-md shadow-rose-950 transition active:scale-95"
              >
                Ver Mesa
              </button>
            </div>
          )}
        </main>
      </div>

      {/* MODAL: NOVA COMANDA */}
      {isNewOrderModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form onSubmit={handleCreateOrder} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
              <h3 className="font-black text-base text-white flex items-center gap-2">
                <Plus size={18} className="text-rose-500" /> Abrir Atendimento
              </h3>
              <button type="button" onClick={() => setIsNewOrderModalOpen(false)} className="text-zinc-500 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-300 block mb-1.5">Identificador (Número ou Nome)</label>
              <input
                type="text"
                autoFocus
                placeholder="Ex: 05, Delivery Carlos, Retirada 12"
                value={newIdentifier}
                onChange={e => setNewIdentifier(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 p-3 rounded-2xl text-sm font-bold text-white focus:outline-none focus:border-rose-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-300 block mb-1.5">Tipo de Atendimento</label>
              <div className="grid grid-cols-4 gap-2">
                {(['Mesa', 'Delivery', 'Retirada', 'Balcão'] as OrderType[]).map(t => (
                  <button
                    type="button"
                    key={t}
                    onClick={() => setNewType(t)}
                    className={`py-2 rounded-xl text-xs font-bold border flex flex-col items-center gap-1 transition ${
                      newType === t 
                        ? 'bg-rose-600 border-rose-500 text-white shadow-md shadow-rose-950' 
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    {getTypeIcon(t)}
                    <span>{t}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-black text-white">Ativar Rodízio?</p>
                  <p className="text-[10px] text-zinc-400">Porções de degustação saem R$ 0,00 na conta.</p>
                </div>
                <input
                  type="checkbox"
                  checked={newIsRodizio}
                  onChange={e => setNewIsRodizio(e.target.checked)}
                  className="h-5 w-5 rounded-lg accent-rose-600"
                />
              </div>

              {newIsRodizio && (
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-800">
                  <div>
                    <label className="text-[11px] font-bold text-zinc-400 block mb-1">Adultos</label>
                    <input
                      type="number"
                      min="1"
                      value={newAdults}
                      onChange={e => setNewAdults(Number(e.target.value))}
                      className="w-full bg-zinc-900 border border-zinc-700 p-2 rounded-xl text-sm font-bold text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-zinc-400 block mb-1">Crianças (Meia)</label>
                    <input
                      type="number"
                      min="0"
                      value={newKids}
                      onChange={e => setNewKids(Number(e.target.value))}
                      className="w-full bg-zinc-900 border border-zinc-700 p-2 rounded-xl text-sm font-bold text-white"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsNewOrderModalOpen(false)}
                className="px-4 py-2.5 text-xs font-bold text-zinc-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="bg-rose-600 hover:bg-rose-500 text-white px-6 py-2.5 rounded-2xl text-xs font-black shadow-lg shadow-rose-950 transition"
              >
                Confirmar e Abrir
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: FECHAMENTO DE CONTA */}
      {isCheckoutModalOpen && activeOrder && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-lg space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
              <div>
                <h3 className="font-black text-lg text-white">Fechamento: {activeOrder.identifier}</h3>
                <p className="text-xs text-zinc-400">Modalidade: {activeOrder.type} • Aberta às {activeOrder.openedAt}</p>
              </div>
              <button onClick={() => setIsCheckoutModalOpen(false)} className="text-zinc-500 hover:text-white">
                <X size={20} />
              </button>
            </div>

            {/* Forma de Pagamento */}
            <div className="space-y-1.5">
              <label className="text-xs font-extrabold text-zinc-300 block">Selecione a Forma de Pagamento</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('PIX')}
                  className={`p-3 rounded-2xl border text-xs font-black flex flex-col items-center gap-1.5 transition ${
                    paymentMethod === 'PIX'
                      ? 'bg-emerald-950 border-emerald-500 text-emerald-300 shadow-md ring-1 ring-emerald-500'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                  }`}
                >
                  <QrCode size={20} />
                  <span>PIX</span>
                  <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-950/80 px-2 py-0.5 rounded-full">Com Desconto</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('Dinheiro')}
                  className={`p-3 rounded-2xl border text-xs font-black flex flex-col items-center gap-1.5 transition ${
                    paymentMethod === 'Dinheiro'
                      ? 'bg-emerald-950 border-emerald-500 text-emerald-300 shadow-md ring-1 ring-emerald-500'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                  }`}
                >
                  <Banknote size={20} />
                  <span>Dinheiro</span>
                  <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-950/80 px-2 py-0.5 rounded-full">Com Desconto</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('Cartao')}
                  className={`p-3 rounded-2xl border text-xs font-black flex flex-col items-center gap-1.5 transition ${
                    paymentMethod === 'Cartao'
                      ? 'bg-rose-950 border-rose-500 text-rose-300 shadow-md ring-1 ring-rose-500'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                  }`}
                >
                  <CreditCard size={20} />
                  <span>Cartão</span>
                  <span className="text-[10px] text-zinc-500 font-normal">Valor Padrão</span>
                </button>
              </div>
            </div>

            {/* DETALHAMENTO DA CONTA (APENAS O QUE É COBRADO) */}
            <div className="space-y-1.5">
              <label className="text-xs font-extrabold text-zinc-300 block">Detalhamento da Conta do Cliente</label>
              <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3.5 max-h-48 overflow-y-auto space-y-2 text-xs">
                
                {/* Rodízio */}
                {activeOrder.isRodizio && (
                  <div className="pb-2 mb-2 border-b border-zinc-800 space-y-1">
                    {activeOrder.rodizioAdults > 0 && (
                      <div className="flex justify-between font-bold text-zinc-200">
                        <span>{activeOrder.rodizioAdults}x Rodízio Adulto (R$ {financial.adultPrice.toFixed(2)})</span>
                        <span className="font-mono">R$ {(activeOrder.rodizioAdults * financial.adultPrice).toFixed(2)}</span>
                      </div>
                    )}
                    {activeOrder.rodizioKids > 0 && (
                      <div className="flex justify-between font-bold text-zinc-200">
                        <span>{activeOrder.rodizioKids}x Rodízio Criança (R$ {financial.kidPrice.toFixed(2)})</span>
                        <span className="font-mono">R$ {(activeOrder.rodizioKids * financial.kidPrice).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Porções À la Carte e Bebidas */}
                {chargedItems.length === 0 ? (
                  <p className="text-zinc-500 text-center py-2">Nenhuma porção extra ou bebida faturada.</p>
                ) : (
                  chargedItems.map(it => (
                    <div key={it.id} className="flex justify-between items-center text-zinc-300">
                      <span className="truncate pr-2">
                        {it.quantity}x {it.name} {it.isAlaCarteExtra && <span className="text-[10px] text-amber-400 font-bold">(À la Carte)</span>}
                      </span>
                      <span className="font-mono text-zinc-300 whitespace-nowrap">
                        R$ {(it.price * it.quantity).toFixed(2)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Total */}
            <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 space-y-1.5 text-xs">
              <div className="flex justify-between text-zinc-400">
                <span>Subtotal:</span>
                <span className="font-mono">R$ {financial.subtotal.toFixed(2)}</span>
              </div>
              {activeOrder.hasServiceTax && (
                <div className="flex justify-between text-amber-400 font-bold">
                  <span>Taxa de Atendimento (10%):</span>
                  <span className="font-mono">R$ {financial.serviceTax.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-xl font-black text-white pt-2 border-t border-zinc-800">
                <span>TOTAL FINAL:</span>
                <span className="font-mono text-emerald-400">R$ {financial.total.toFixed(2)}</span>
              </div>
            </div>

              <div className="flex justify-between items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsCheckoutModalOpen(false);
                    setIsReceiptModalOpen(true);
                  }}
                  className="px-3 py-2.5 text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1.5 bg-amber-950/40 border border-amber-800/60 rounded-xl"
                >
                  <Receipt size={14} /> Cupom Não Fiscal
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCheckoutModalOpen(false)}
                    className="px-4 py-2.5 text-xs font-bold text-zinc-400 hover:text-white"
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseOrder}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-2xl text-xs font-black flex items-center gap-1.5 shadow-lg shadow-emerald-950 transition"
                  >
                    <CheckCircle2 size={16} /> Confirmar & Fechar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      {/* MODAL: EDITAR OBSERVAÇÃO DO ITEM */}
      {editingNotesItemId && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 w-full max-w-sm space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-2.5">
              <h3 className="font-bold text-sm text-white flex items-center gap-1.5">
                <MessageSquare size={16} className="text-amber-400" />
                Observação do Item
              </h3>
              <button
                type="button"
                onClick={() => setEditingNotesItemId(null)}
                className="text-zinc-500 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-300 block mb-1">
                Observação para a Produção / Cozinha:
              </label>
              <input
                type="text"
                autoFocus
                placeholder="Ex: sem cebolinha, pouco arroz..."
                value={itemNoteText}
                onChange={(e) => setItemNoteText(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 p-2.5 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Sugestões rápidas */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Sugestões Rápidas:</span>
              <div className="flex flex-wrap gap-1.5">
                {['Sem cebolinha', 'Sem gergelim', 'Pouco arroz', 'Bem frito', 'Molho à parte', 'Sem cream cheese'].map((sug) => (
                  <button
                    key={sug}
                    type="button"
                    onClick={() => setItemNoteText(prev => prev ? `${prev}, ${sug}` : sug)}
                    className="text-[10px] bg-zinc-950 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 px-2 py-1 rounded-lg transition"
                  >
                    + {sug}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setEditingNotesItemId(null)}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white font-medium"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveItemNotes}
                className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-1.5 rounded-xl text-xs font-bold transition shadow-md shadow-amber-950"
              >
                Salvar Observação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL OFICIAL: CONFERIR E IMPRIMIR (CUPOM NÃO FISCAL) */}
      {activeOrder && (
        <NonFiscalReceiptModal
          isOpen={isReceiptModalOpen}
          initialMode={receiptModalMode}
          onClose={() => setIsReceiptModalOpen(false)}
          orderIdentifier={activeOrder.identifier}
          orderType={activeOrder.type}
          isRodizio={activeOrder.isRodizio}
          rodizioAdults={activeOrder.rodizioAdults}
          rodizioKids={activeOrder.rodizioKids}
          items={activeOrder.items.map(it => ({
            id: it.id,
            productId: it.productId,
            code: it.code,
            name: it.name,
            price: it.price,
            quantity: it.quantity,
            category: it.category,
            isAlaCarteExtra: it.isAlaCarteExtra,
            isRodizioIncluded: it.isRodizioIncluded
          }))}
          financial={{
            adultPrice: financial.adultPrice,
            kidPrice: financial.kidPrice,
            rodizioAdultsTotal: activeOrder.isRodizio ? activeOrder.rodizioAdults * financial.adultPrice : 0,
            rodizioKidsTotal: activeOrder.isRodizio ? activeOrder.rodizioKids * financial.kidPrice : 0,
            rodizioTotal: financial.rodizioTotal,
            itemsTotal: financial.itemsTotal,
            subtotal: financial.subtotal,
            serviceTax: financial.serviceTax,
            total: financial.total
          }}
          hasServiceTax={activeOrder.hasServiceTax}
          initialPaymentMethod={paymentMethod}
          onCompleteOrder={(chosenPayment, receipt) => {
            const closedTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            const updated = orders.map(ord => 
              ord.id === activeOrder.id 
                ? { 
                    ...ord, 
                    status: 'fechada' as OrderStatus, 
                    closedAt: closedTime, 
                    paymentMethod: chosenPayment as any,
                    totalPaid: receipt.financial.total,
                    lastReceiptJobId: receipt.id,
                    reprintCount: 1,
                    updatedAt: new Date().toISOString()
                  } 
                : ord
            );
            persistOrders(updated);
            const activeClosed = updated.find(o => o.id === activeOrder.id);
            if (activeClosed) syncOrderToFirestore(activeClosed);

            setPrintFeedback(`✓ Venda concluída e comanda encerrada (${receipt.receiptNumber})`);
            setTimeout(() => setPrintFeedback(null), 5000);
          }}
        />
      )}

      {/* Modal de Controle de Operador e Status de Conexão Cloud */}
      <OperatorAuthModal 
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        status={systemStatus}
      />

      {/* Modal de Instruções para Exportar o Projeto para o Notebook */}
      {isExportHelpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-rose-950 border border-rose-800 rounded-xl text-rose-400">
                  <Download size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">Como Exportar para o Notebook</h3>
                  <p className="text-xs text-zinc-400">Download do código e Print Agent Windows</p>
                </div>
              </div>
              <button 
                onClick={() => setIsExportHelpOpen(false)} 
                className="text-zinc-400 hover:text-white p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <div className="text-xs text-zinc-300 space-y-3 leading-relaxed">
              <p>
                Para obter o pacote ZIP limpo e validado para uso no Windows com a Epson TM-T20X:
              </p>
              <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2">
                <p className="font-bold text-zinc-100 text-xs flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                  Exportação Nativa do Google AI Studio:
                </p>
                <p className="text-[11px] text-zinc-400 leading-normal">
                  No topo direito da página do Google AI Studio (na barra superior da própria plataforma), clique no ícone de <strong>Download / Export Code</strong> (ou no menu de três pontinhos <strong>...</strong> ao lado do botão <em>Share</em>) e confirme a exportação.
                </p>
              </div>
              <p className="text-[11px] text-zinc-400">
                O arquivo exportado conterá a pasta <code>print-agent\</code> com todos os scripts <code>.bat</code> prontos para execução no seu notebook Windows.
              </p>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setIsExportHelpOpen(false)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold transition"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}