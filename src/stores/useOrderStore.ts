import { create } from 'zustand';
import { Order, OrderItem, OrderType, Product } from '../types';
import { INITIAL_PRODUCTS } from '../data/initialProducts';
import { db, auth } from '../lib/firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';

interface OrderStore {
  orders: Order[];
  activeOrderId: string | null;
  products: Product[];
  selectedCategory: string;
  searchQuery: string;

  // Ações de comanda
  openOrder: (
    code: string,
    type: OrderType,
    isRodizio?: boolean,
    adultsCount?: number,
    childrenCount?: number,
    adultPrice?: number,
    adultPixPrice?: number,
    childPrice?: number,
    childPixPrice?: number
  ) => string;
  setActiveOrder: (orderId: string | null) => void;
  addItemToOrder: (orderId: string, product: Product, quantity?: number, notes?: string) => void;
  updateItemQuantity: (orderId: string, itemId: string, delta: number) => void;
  removeItem: (orderId: string, itemId: string) => void;
  toggleRodizio: (orderId: string) => void;
  updateRodizioDetails: (
    orderId: string,
    adultsCount: number,
    childrenCount: number,
    adultPrice?: number,
    adultPixPrice?: number,
    childPrice?: number,
    childPixPrice?: number
  ) => void;
  toggleServiceCharge: (orderId: string) => void;
  setDiscount: (orderId: string, discount: number) => void;
  closeOrder: (orderId: string, paymentMethod: string) => Order | null;
  deleteOrder: (orderId: string) => void;

  // Filtros
  setSelectedCategory: (cat: string) => void;
  setSearchQuery: (query: string) => void;

  // Auxiliares de cálculo
  calculateOrderTotals: (
    order: Order,
    overridePaymentMethod?: string
  ) => {
    subtotal: number;
    rodizioTotal: number;
    adultsTotal: number;
    childrenTotal: number;
    adultUnitPrice: number;
    childUnitPrice: number;
    itemsTotal: number;
    serviceCharge: number;
    discount: number;
    total: number;
    isPix: boolean;
  };
}

const STORAGE_KEY = 'umai_orders_v3';

function loadInitialOrders(): Order[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.error('Falha ao carregar comandas salvas:', e);
  }

  // Comanda de exemplo inicial com Rodízio
  return [
    {
      id: 'order-mesa-1',
      code: 'Mesa 01',
      type: 'mesa',
      status: 'aberta',
      items: [
        {
          id: 'item-1',
          productId: 't1',
          code: '101',
          name: 'Temaki de Salmão com Arroz (1 un.)',
          price: 26.0,
          quantity: 2,
          category: 'Temakis',
          createdAt: new Date().toISOString(),
          isRodizioItem: true,
        },
        {
          id: 'item-2',
          productId: 's1',
          code: '201',
          name: 'Tempurá Roll (8 un.)',
          price: 26.0,
          quantity: 1,
          category: 'Sushis',
          createdAt: new Date().toISOString(),
          isRodizioItem: true,
        },
        {
          id: 'item-3',
          productId: 'b1',
          code: '501',
          name: 'Coca-Cola 310ml',
          price: 6.5,
          quantity: 2,
          category: 'Bebidas',
          createdAt: new Date().toISOString(),
          isRodizioItem: false,
        },
      ],
      isRodizio: true,
      adultsCount: 2,
      childrenCount: 0,
      adultPrice: 85.0,
      adultPixPrice: 79.9,
      childPrice: 42.5,
      childPixPrice: 39.9,
      hasServiceCharge: true,
      discount: 0,
      openedAt: new Date().toISOString(),
      waiterName: 'Garçom 1',
    },
  ];
}

function saveOrdersToStorage(orders: Order[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  } catch (e) {
    console.error('Falha ao salvar comandas no localStorage:', e);
  }
}

function syncOrderToFirestore(order: Order) {
  if (!auth.currentUser) return;
  const path = `restaurants/${auth.currentUser.uid}/orders/${order.id}`;
  setDoc(doc(db, path), { ...order }).catch((err) => console.warn('Sync Firestore ignorado:', err));
}

export const useOrderStore = create<OrderStore>((set, get) => ({
  orders: loadInitialOrders(),
  activeOrderId: 'order-mesa-1',
  products: INITIAL_PRODUCTS,
  selectedCategory: 'Todos',
  searchQuery: '',

  setSelectedCategory: (cat) => set({ selectedCategory: cat }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setActiveOrder: (orderId) => set({ activeOrderId: orderId }),

  calculateOrderTotals: (order: Order, overridePaymentMethod?: string) => {
    const payment = overridePaymentMethod ?? order.paymentMethod;
    const isPix = payment === 'PIX';

    let rodizioTotal = 0;
    let adultsTotal = 0;
    let childrenTotal = 0;

    const adultUnitPrice = isPix ? (order.adultPixPrice ?? 79.9) : (order.adultPrice ?? 85.0);
    const childUnitPrice = isPix ? (order.childPixPrice ?? 39.9) : (order.childPrice ?? 42.5);

    if (order.isRodizio) {
      const adults = order.adultsCount ?? 1;
      const children = order.childrenCount ?? 0;

      adultsTotal = adults * adultUnitPrice;
      childrenTotal = children * childUnitPrice;
      rodizioTotal = adultsTotal + childrenTotal;
    }

    // Itens: itens com isRodizioItem === true saem a R$ 0,00. Bebidas e Sobremesas são somadas normalmente.
    const itemsTotal = order.items.reduce((sum, item) => {
      if (order.isRodizio && item.isRodizioItem) return sum;
      return sum + item.price * item.quantity;
    }, 0);

    const subtotal = rodizioTotal + itemsTotal;
    const serviceCharge = order.hasServiceCharge ? subtotal * 0.1 : 0;
    const discount = order.discount || 0;
    const total = Math.max(0, subtotal + serviceCharge - discount);

    return {
      subtotal,
      rodizioTotal,
      adultsTotal,
      childrenTotal,
      adultUnitPrice,
      childUnitPrice,
      itemsTotal,
      serviceCharge,
      discount,
      total,
      isPix,
    };
  },

  openOrder: (
    code,
    type,
    isRodizio = false,
    adultsCount = 1,
    childrenCount = 0,
    adultPrice = 85.0,
    adultPixPrice = 79.9,
    childPrice = 42.5,
    childPixPrice = 39.9
  ) => {
    const newId = `order-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newOrder: Order = {
      id: newId,
      code: code.trim() || `${type.toUpperCase()} ${get().orders.length + 1}`,
      type,
      status: 'aberta',
      items: [],
      isRodizio,
      adultsCount: Math.max(0, adultsCount),
      childrenCount: Math.max(0, childrenCount),
      adultPrice,
      adultPixPrice,
      childPrice,
      childPixPrice,
      hasServiceCharge: type === 'mesa', // padrão 10% para mesas
      discount: 0,
      openedAt: new Date().toISOString(),
    };

    const updated = [...get().orders, newOrder];
    saveOrdersToStorage(updated);
    syncOrderToFirestore(newOrder);
    set({ orders: updated, activeOrderId: newId });
    return newId;
  },

  addItemToOrder: (orderId, product, quantity = 1, notes = '') => {
    const orders = get().orders.map((ord) => {
      if (ord.id !== orderId) return ord;

      // Bebidas e Sobremesas não entram como R$ 0,00 no rodízio
      const isRodizioItem =
        ord.isRodizio && product.category !== 'Bebidas' && product.category !== 'Sobremesas';

      const existingIdx = ord.items.findIndex(
        (i) => i.productId === product.id && (i.notes || '') === (notes || '')
      );

      let newItems = [...ord.items];
      if (existingIdx >= 0) {
        newItems[existingIdx] = {
          ...newItems[existingIdx],
          quantity: newItems[existingIdx].quantity + quantity,
        };
      } else {
        newItems.push({
          id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          productId: product.id,
          code: product.code,
          name: product.name,
          price: product.price,
          quantity,
          notes,
          category: product.category,
          createdAt: new Date().toISOString(),
          isRodizioItem,
        });
      }

      const updatedOrder = { ...ord, items: newItems };
      syncOrderToFirestore(updatedOrder);
      return updatedOrder;
    });

    saveOrdersToStorage(orders);
    set({ orders });
  },

  updateItemQuantity: (orderId, itemId, delta) => {
    const orders = get().orders.map((ord) => {
      if (ord.id !== orderId) return ord;
      const updatedItems = ord.items
        .map((item) => {
          if (item.id !== itemId) return item;
          const newQty = item.quantity + delta;
          return newQty > 0 ? { ...item, quantity: newQty } : null;
        })
        .filter(Boolean) as OrderItem[];

      const updatedOrder = { ...ord, items: updatedItems };
      syncOrderToFirestore(updatedOrder);
      return updatedOrder;
    });

    saveOrdersToStorage(orders);
    set({ orders });
  },

  removeItem: (orderId, itemId) => {
    const orders = get().orders.map((ord) => {
      if (ord.id !== orderId) return ord;
      const updatedOrder = { ...ord, items: ord.items.filter((i) => i.id !== itemId) };
      syncOrderToFirestore(updatedOrder);
      return updatedOrder;
    });
    saveOrdersToStorage(orders);
    set({ orders });
  },

  toggleRodizio: (orderId) => {
    const orders = get().orders.map((ord) => {
      if (ord.id !== orderId) return ord;
      const willBeRodizio = !ord.isRodizio;
      const updatedItems = ord.items.map((item) => ({
        ...item,
        isRodizioItem:
          willBeRodizio && item.category !== 'Bebidas' && item.category !== 'Sobremesas',
      }));
      const updatedOrder = {
        ...ord,
        isRodizio: willBeRodizio,
        adultsCount: ord.adultsCount ?? 1,
        childrenCount: ord.childrenCount ?? 0,
        adultPrice: ord.adultPrice ?? 85.0,
        adultPixPrice: ord.adultPixPrice ?? 79.9,
        childPrice: ord.childPrice ?? 42.5,
        childPixPrice: ord.childPixPrice ?? 39.9,
        items: updatedItems,
      };
      syncOrderToFirestore(updatedOrder);
      return updatedOrder;
    });
    saveOrdersToStorage(orders);
    set({ orders });
  },

  updateRodizioDetails: (
    orderId,
    adultsCount,
    childrenCount,
    adultPrice = 85.0,
    adultPixPrice = 79.9,
    childPrice = 42.5,
    childPixPrice = 39.9
  ) => {
    const orders = get().orders.map((ord) => {
      if (ord.id !== orderId) return ord;
      const updatedOrder = {
        ...ord,
        adultsCount: Math.max(0, adultsCount),
        childrenCount: Math.max(0, childrenCount),
        adultPrice: Math.max(0, adultPrice),
        adultPixPrice: Math.max(0, adultPixPrice),
        childPrice: Math.max(0, childPrice),
        childPixPrice: Math.max(0, childPixPrice),
      };
      syncOrderToFirestore(updatedOrder);
      return updatedOrder;
    });
    saveOrdersToStorage(orders);
    set({ orders });
  },

  toggleServiceCharge: (orderId) => {
    const orders = get().orders.map((ord) => {
      if (ord.id !== orderId) return ord;
      const updatedOrder = { ...ord, hasServiceCharge: !ord.hasServiceCharge };
      syncOrderToFirestore(updatedOrder);
      return updatedOrder;
    });
    saveOrdersToStorage(orders);
    set({ orders });
  },

  setDiscount: (orderId, discount) => {
    const orders = get().orders.map((ord) => {
      if (ord.id !== orderId) return ord;
      const updatedOrder = { ...ord, discount: Math.max(0, discount) };
      syncOrderToFirestore(updatedOrder);
      return updatedOrder;
    });
    saveOrdersToStorage(orders);
    set({ orders });
  },

  closeOrder: (orderId, paymentMethod) => {
    let closed: Order | null = null;
    const orders = get().orders.map((ord) => {
      if (ord.id !== orderId) return ord;
      closed = {
        ...ord,
        status: 'fechada' as const,
        closedAt: new Date().toISOString(),
        paymentMethod,
      };
      syncOrderToFirestore(closed);
      return closed;
    });

    saveOrdersToStorage(orders);
    set({
      orders,
      activeOrderId: get().orders.find((o) => o.id !== orderId && o.status === 'aberta')?.id || null,
    });
    return closed;
  },

  deleteOrder: (orderId) => {
    const orders = get().orders.filter((o) => o.id !== orderId);
    saveOrdersToStorage(orders);
    if (auth.currentUser) {
      deleteDoc(doc(db, `restaurants/${auth.currentUser.uid}/orders/${orderId}`)).catch(() => {});
    }
    set({
      orders,
      activeOrderId: get().activeOrderId === orderId ? orders[0]?.id || null : get().activeOrderId,
    });
  },
}));
