import { Product } from '../types';

export const INITIAL_PRODUCTS: Product[] = [
  // TEMAKIS
  { id: 't1', code: '101', name: 'Temaki de Salmão com Arroz (1 un.)', price: 26.00, category: 'Temakis' },
  { id: 't2', code: '102', name: 'Temaki Temperado de Camarão com Arroz (1 un.)', price: 29.00, category: 'Temakis' },
  { id: 't3', code: '103', name: 'Temaki Frito de Salmão com Arroz (1 un.)', price: 30.00, category: 'Temakis' },
  { id: 't4', code: '104', name: 'Temaki Frito de Camarão com Arroz (1 un.)', price: 33.00, category: 'Temakis' },

  // SUSHIS
  { id: 's1', code: '201', name: 'Tempurá Roll (8 un.)', price: 26.00, category: 'Sushis' },
  { id: 's2', code: '202', name: 'Tamaroll (8 un.)', price: 22.00, category: 'Sushis' },
  { id: 's3', code: '203', name: 'Uramaki de Salmão (8 un.)', price: 22.00, category: 'Sushis' },
  { id: 's4', code: '204', name: 'Makimono de Salmão (8 un.)', price: 22.00, category: 'Sushis' },
  { id: 's5', code: '205', name: 'Makimono de Camarão (8 un.)', price: 22.00, category: 'Sushis' },
  { id: 's6', code: '206', name: 'Hot Philadelphia de Salmão com Arroz (8 un.)', price: 32.00, category: 'Sushis' },
  { id: 's7', code: '207', name: 'Hot de Camarão com Arroz (8 un.)', price: 36.00, category: 'Sushis' },
  { id: 's8', code: '208', name: 'Hot Skin (8 un.)', price: 26.00, category: 'Sushis' },
  { id: 's9', code: '209', name: 'Joy com Cream Cheese (8 un.)', price: 32.00, category: 'Sushis' },
  { id: 's10', code: '210', name: 'Joy de Camarão (8 un.)', price: 39.00, category: 'Sushis' },
  { id: 's11', code: '211', name: 'Shakemaki (8 un.)', price: 39.00, category: 'Sushis' },
  { id: 's12', code: '212', name: 'Niguiri de Salmão (4 un.)', price: 24.00, category: 'Sushis' },
  { id: 's13', code: '213', name: 'Niguiri de Camarão (4 un.)', price: 24.00, category: 'Sushis' },

  // COMBINADOS
  { id: 'c1', code: '301', name: 'Box 16 Peças (Combinado)', price: 48.00, category: 'Combinados' },
  { id: 'c2', code: '302', name: 'Box 26 Peças (Combinado)', price: 78.00, category: 'Combinados' },

  // ESPECIAIS
  { id: 'e1', code: '401', name: 'Carpaccio de Salmão (15 un.)', price: 39.00, category: 'Especiais' },
  { id: 'e2', code: '402', name: 'Carpaccio de Tilápia (15 un.)', price: 35.00, category: 'Especiais' },
  { id: 'e3', code: '403', name: 'Tataki de Salmão (250g)', price: 36.00, category: 'Especiais' },
  { id: 'e4', code: '404', name: 'Tataki de Tilápia (250g)', price: 32.00, category: 'Especiais' },
  { id: 'e5', code: '405', name: 'Salmão Frito (6 un.)', price: 40.00, category: 'Especiais' },
  { id: 'e6', code: '406', name: 'Camarão Frito (15 un.)', price: 29.00, category: 'Especiais' },
  { id: 'e7', code: '407', name: 'Guioza (8 un.)', price: 34.00, category: 'Especiais' },
  { id: 'e8', code: '408', name: 'Ceviche de Salmão (250g)', price: 36.00, category: 'Especiais' },
  { id: 'e9', code: '409', name: 'Ceviche de Tilápia com Abacaxi (400g)', price: 32.00, category: 'Especiais' },
  { id: 'e10', code: '410', name: 'Yakissoba de Carne (500g)', price: 32.00, category: 'Especiais' },
  { id: 'e11', code: '411', name: 'Yakissoba de Frango (500g)', price: 28.00, category: 'Especiais' },
  { id: 'e12', code: '412', name: 'Yakissoba de Camarão (500g)', price: 36.00, category: 'Especiais' },
  { id: 'e13', code: '413', name: 'Harumaki de Queijo (6 un.)', price: 30.00, category: 'Especiais' },
  { id: 'e14', code: '414', name: 'Harumaki de Camarão (6 un.)', price: 30.00, category: 'Especiais' },
  { id: 'e15', code: '415', name: 'Robata de Camarão com Queijo Coalho no Palito (6 un.)', price: 36.00, category: 'Especiais' },
  { id: 'e16', code: '416', name: 'Shimeji (200g)', price: 33.00, category: 'Especiais' },
  { id: 'e17', code: '417', name: 'Sashimi de Salmão (5 fatias)', price: 30.00, category: 'Especiais' },
  { id: 'e18', code: '418', name: 'Sashimi de Tilápia (5 fatias)', price: 30.00, category: 'Especiais' },

  // BEBIDAS
  { id: 'b1', code: '501', name: 'Coca-Cola 310ml', price: 6.50, category: 'Bebidas' },
  { id: 'b2', code: '502', name: 'Coca-Cola Zero 310ml', price: 6.50, category: 'Bebidas' },
  { id: 'b3', code: '503', name: 'Água Tônica 350ml', price: 5.50, category: 'Bebidas' },
  { id: 'b4', code: '504', name: 'Água sem Gás 500ml', price: 5.50, category: 'Bebidas' },
  { id: 'b5', code: '505', name: 'Água com Gás 500ml', price: 6.50, category: 'Bebidas' },
  { id: 'b6', code: '506', name: 'Cerveja Heineken 330ml', price: 10.00, category: 'Bebidas' },
  { id: 'b7', code: '507', name: 'Cerveja Heineken Zero Álcool 330ml', price: 10.00, category: 'Bebidas' },

  // SOBREMESAS
  { id: 'so1', code: '601', name: 'Harumaki de Doce de Leite (1 un.)', price: 6.00, category: 'Sobremesas' },
  { id: 'so2', code: '602', name: 'Harumaki de Beijinho (1 un.)', price: 6.00, category: 'Sobremesas' }
];

export const initialProducts = INITIAL_PRODUCTS;
