import type { Timestamp } from 'firebase-admin/firestore';

export type PrinterRole = "SUSHIBAR" | "COZINHA" | "CAIXA" | "TODOS";

export interface PrinterConfig {
  printerName: string;
  paperWidth: number;
  autoCut: boolean;
  debug: boolean;
  restaurantId: string;
  printerRole?: string;
  printerRoles: string[]; // e.g. ["CAIXA", "COZINHA", "SUSHIBAR"] ou ["TODOS"]
  firestoreDatabaseId?: string;
  pollingOrListener: boolean;
  serviceAccountPath?: string;
}

export type PrintJobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "spooler_sent_uncertain";

export interface PrintJob {
  id: string;
  restaurantId: string;
  printerRole: PrinterRole;
  printerName?: string;
  title?: string;
  status: PrintJobStatus;
  content: string | Record<string, any>;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  processingAt?: Timestamp;
  completedAt?: Timestamp;
  failedAt?: Timestamp;
  retryCount: number;
  errorMessage?: string;
}

export interface WindowsPrinterInfo {
  name: string;
  portName: string;
  driverName: string;
  isDefault: boolean;
  isOffline: boolean;
  status: string;
}

export interface PrintResult {
  success: boolean;
  printerName: string;
  bytesSent: number;
  timestamp: string;
  errorCode?: number;
  errorMessage?: string;
  isSimulated?: boolean;
}
