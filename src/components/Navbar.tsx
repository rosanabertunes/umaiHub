import React from 'react';
import { useSerialPort, SerialPortHook } from '../hooks/useSerialPort';
import { Printer, CheckCircle2, AlertCircle, RefreshCw, Power } from 'lucide-react';

interface Props {
  serial: SerialPortHook;
  autoPrint: boolean;
  setAutoPrint: (enabled: boolean) => void;
  openOrdersCount: number;
}

export const Navbar: React.FC<Props> = ({ serial, autoPrint, setAutoPrint, openOrdersCount }) => {
  return (
    <header className="bg-zinc-900 border-b border-zinc-800 px-4 py-2.5 flex items-center justify-between text-white select-none">
      {/* Marca / Logo */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-red-600 flex items-center justify-center font-black text-sm shadow-md shadow-red-950">
          う
        </div>
        <div>
          <h1 className="text-sm font-black tracking-wider uppercase text-zinc-100 flex items-center gap-1.5">
            Umai Sushi <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-red-400 font-mono">PDV LEVE</span>
          </h1>
          <p className="text-[10px] text-zinc-400 font-medium">Terminal Rápido USB ESC/POS</p>
        </div>
      </div>

      {/* Status da Impressora USB & Controles */}
      <div className="flex items-center gap-3">
        {/* Switch de Auto-Print */}
        <label className="hidden sm:flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer bg-zinc-950 px-2.5 py-1.5 rounded-xl border border-zinc-800">
          <input
            type="checkbox"
            checked={autoPrint}
            onChange={(e) => setAutoPrint(e.target.checked)}
            className="w-3.5 h-3.5 accent-red-600 rounded cursor-pointer"
          />
          <span className="text-[11px] font-medium">Auto-Impressão</span>
        </label>

        {/* Conexão USB Web Serial */}
        <div className="flex items-center gap-2 bg-zinc-950 p-1.5 rounded-xl border border-zinc-800">
          <div className="flex items-center gap-1.5 px-2">
            <Printer size={15} className={serial.isConnected ? 'text-emerald-400' : 'text-zinc-500'} />
            <div className="text-[11px] leading-tight">
              <span className={`font-bold block ${serial.isConnected ? 'text-emerald-400' : 'text-zinc-400'}`}>
                {serial.isConnected ? 'USB Conectada' : 'USB Desconectada'}
              </span>
              <span className="text-[9px] text-zinc-500 font-mono">
                {serial.baudRate} bps
              </span>
            </div>
          </div>

          {serial.isConnected ? (
            <button
              onClick={serial.disconnect}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1"
              title="Desconectar impressora USB"
            >
              <Power size={12} /> Desconectar
            </button>
          ) : (
            <button
              onClick={serial.connect}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded-lg text-xs font-bold shadow-md shadow-emerald-950 flex items-center gap-1"
            >
              <CheckCircle2 size={12} /> Conectar USB
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
