import { useEffect, useCallback, useRef } from 'react';
import { Order, OrderItem } from '../types';
import { buildReceiptEscPos, buildKitchenEscPos } from '../utils/escposFormatter';
import { db, auth, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';

interface AutoPrintProps {
  printRawBytes: (bytes: Uint8Array) => Promise<boolean>;
  isConnected: boolean;
  autoPrintEnabled?: boolean;
}

export function useAutoPrint({ printRawBytes, isConnected, autoPrintEnabled = false }: AutoPrintProps) {
  const printedOrdersRef = useRef<Set<string>>(new Set());

  // Função para imprimir cupom de cliente / fechamento
  const printCustomerReceipt = useCallback(
    async (order: Order, isFinal = true): Promise<boolean> => {
      try {
        const bytes = buildReceiptEscPos(order, { isFinal });
        return await printRawBytes(bytes);
      } catch (err) {
        console.error('Falha ao gerar cupom do cliente:', err);
        return false;
      }
    },
    [printRawBytes]
  );

  // Função para imprimir pedido de produção (cozinha / sushibar)
  const printKitchenTicket = useCallback(
    async (orderCode: string, items: OrderItem[], sector: 'COZINHA' | 'BAR' | 'SUSHIBAR' = 'COZINHA'): Promise<boolean> => {
      try {
        if (!items || items.length === 0) return true;
        const bytes = buildKitchenEscPos(orderCode, items, sector);
        return await printRawBytes(bytes);
      } catch (err) {
        console.error('Falha ao gerar comanda de produção:', err);
        return false;
      }
    },
    [printRawBytes]
  );

  // Escuta opcional no Firestore para comandas criadas por garçons em outros dispositivos
  useEffect(() => {
    if (!autoPrintEnabled || !isConnected || !auth.currentUser) return;

    const path = `restaurants/${auth.currentUser.uid}/orders`;
    const q = query(collection(db, path), where('status', '==', 'aberta'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const data = change.doc.data() as Order;
            // Se ainda não foi impresso automaticamente
            if (data.items && data.items.length > 0 && !printedOrdersRef.current.has(data.id)) {
              printedOrdersRef.current.add(data.id);
              printKitchenTicket(data.code, data.items, 'COZINHA');
            }
          }
        });
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );

    return () => unsubscribe();
  }, [autoPrintEnabled, isConnected, printKitchenTicket]);

  return {
    printCustomerReceipt,
    printKitchenTicket,
  };
}
