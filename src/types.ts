export interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  code: string;
  description?: string;
  imageUrl?: string;
  isActive?: boolean;
}

export type OrderType = 'mesa' | 'delivery' | 'retirada' | 'balcao';

export interface OrderItem {
  id: string;
  productId: string;
  code?: string;
  name: string;
  price: number; // In rodizio mode, included sushi/dishes have price 0
  quantity: number;
  notes?: string;
  category?: string;
  createdAt: string;
  printedToKitchen?: boolean;
  isRodizioItem?: boolean;
}

export interface Order {
  id: string;
  code: string; // e.g., "Mesa 01", "Comanda 15", "Delivery Lucas", "Balcão"
  type: OrderType;
  customerName?: string;
  status: 'aberta' | 'fechada';
  items: OrderItem[];
  isRodizio: boolean;
  adultsCount: number; // Quantidade de Adultos
  childrenCount: number; // Quantidade de Crianças
  adultPrice: number; // R$ 85,00 padrão
  adultPixPrice: number; // R$ 79,90 no PIX
  childPrice: number; // R$ 42,50 padrão
  childPixPrice: number; // R$ 39,90 no PIX
  hasServiceCharge: boolean; // 10%
  discount: number;
  openedAt: string;
  closedAt?: string;
  paymentMethod?: string;
  waiterName?: string;
}

export interface PrintOptions {
  title?: string;
  footer?: string;
  isKitchen?: boolean;
  cutPaper?: boolean;
}
