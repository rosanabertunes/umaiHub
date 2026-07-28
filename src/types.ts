export interface Product {
  id: string;
  name: string;
  price: number;
  category: string; // Dynamic Category Name
  code: string; // Fast code for typing, e.g. "101"
  description?: string; // Optional description
  imageUrl?: string; // Optional product image URL
  isActive?: boolean; // Active or Inactive status, default true
}

export type Category = string;

export interface OrderItem {
  id: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
  notes?: string;
  createdAt: string; // Timestamp
}

export type TableStatus = 'Livre' | 'Ocupada' | 'Reservada';

export interface Table {
  id: number; // Table number, e.g., 1, 2, 3...
  status: TableStatus;
  items: OrderItem[];
  waiterName?: string;
  clientCount?: number;
  openedAt?: string;
  hasServiceCharge?: boolean;
}

export type PaymentMethod = 'PIX' | 'Dinheiro' | 'Cartão de Crédito' | 'Cartão de Débito';

export interface SaleRecord {
  id: string;
  tableId: number;
  closedAt: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  total: number;
  clientCount: number;
  paymentMethod: PaymentMethod;
}
