import { useState, useCallback, useEffect, useRef } from 'react';

export interface SerialPortHook {
  isConnected: boolean;
  isSupported: boolean;
  portInfo: string | null;
  baudRate: number;
  setBaudRate: (rate: number) => void;
  connect: () => Promise<boolean>;
  connectUsbPrinter: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  printRawBytes: (bytes: Uint8Array) => Promise<boolean>;
  sendRawData: (bytes: Uint8Array) => Promise<boolean>;
  errorMessage: string | null;
}

export function useSerialPort(): SerialPortHook {
  const [isConnected, setIsConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [baudRate, setBaudRate] = useState<number>(38400); // Padrão Epson TM-T20X
  const [portInfo, setPortInfo] = useState<string | null>(null);
  const isSupported = typeof navigator !== 'undefined' && 'serial' in navigator;

  const portRef = useRef<any>(null);

  // Desconectar na desmontagem
  useEffect(() => {
    return () => {
      if (portRef.current) {
        try {
          portRef.current.close().catch(() => {});
        } catch {}
      }
    };
  }, []);

  const connect = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      setErrorMessage('Web Serial API não é suportada neste navegador. Use Google Chrome ou Edge no Desktop.');
      return false;
    }

    try {
      setErrorMessage(null);
      // Solicita a porta USB ao usuário
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate });

      portRef.current = port;
      setIsConnected(true);

      const info = port.getInfo?.() || {};
      setPortInfo(`USB (Vendor: ${info.usbVendorId || 'Epson/Genérica'})`);
      return true;
    } catch (err: any) {
      console.error('Erro ao conectar porta serial USB:', err);
      if (err.name !== 'NotFoundError') {
        setErrorMessage(err.message || 'Falha ao conectar na impressora USB.');
      }
      setIsConnected(false);
      return false;
    }
  }, [isSupported, baudRate]);

  const disconnect = useCallback(async () => {
    if (portRef.current) {
      try {
        await portRef.current.close();
      } catch (err) {
        console.warn('Erro ao fechar porta:', err);
      }
      portRef.current = null;
    }
    setIsConnected(false);
    setPortInfo(null);
  }, []);

  const printRawBytes = useCallback(
    async (bytes: Uint8Array): Promise<boolean> => {
      // Se não estiver conectado, tenta reconectar ou avisar
      if (!portRef.current || !isConnected) {
        console.warn('Impressora USB não conectada. Conecte antes de imprimir.');
        return false;
      }

      try {
        const writer = portRef.current.writable.getWriter();
        await writer.write(bytes);
        writer.releaseLock();
        return true;
      } catch (err: any) {
        console.error('Erro ao enviar bytes para impressora:', err);
        setErrorMessage(`Falha no envio para impressora: ${err.message}`);
        return false;
      }
    },
    [isConnected]
  );

  return {
    isConnected,
    isSupported,
    portInfo,
    baudRate,
    setBaudRate,
    connect,
    connectUsbPrinter: connect,
    disconnect,
    printRawBytes,
    sendRawData: printRawBytes,
    errorMessage,
  };
}
