import React, { useState } from 'react';
import { Wallet, ChevronDown, LogOut, AlertCircle, Loader2 } from 'lucide-react';
import { useWallet, shortenAddress } from '../../context/WalletContext';
import { cn } from '../../lib/utils';

export function WalletButton({ className }: { className?: string }) {
  const { connected, address, network, connecting, error, connect, disconnect } = useWallet();
  const [open, setOpen] = useState(false);

  if (connecting) {
    return (
      <button
        disabled
        className={cn(
          'inline-flex items-center gap-2 px-3.5 py-1.5 rounded-pill text-xs font-semibold',
          'bg-brand-100 text-brand-500 cursor-not-allowed border border-brand-200',
          className,
        )}
      >
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Connecting…
      </button>
    );
  }

  if (!connected) {
    return (
      <div className="relative group">
        <button
          onClick={connect}
          className={cn(
            'inline-flex items-center gap-2 px-3.5 py-1.5 rounded-pill text-xs font-semibold transition-all',
            'bg-brand-900 text-white hover:bg-brand-800 border border-transparent',
            className,
          )}
        >
          <Wallet className="w-3.5 h-3.5" />
          Connect Wallet
        </button>
        {error && (
          <div className="absolute right-0 top-9 z-50 w-64 p-3 rounded-2xl bg-white border border-red-200 shadow-card-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex items-center gap-2 px-3.5 py-1.5 rounded-pill text-xs font-semibold transition-all',
          'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100',
          className,
        )}
      >
        {/* Green dot */}
        <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
        {address ? shortenAddress(address) : 'Connected'}
        <ChevronDown className={cn('w-3 h-3 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-50 w-56 bg-white border border-gray-200/80 rounded-2xl shadow-card-lg p-3 space-y-2">
            <div className="px-1 pb-2 border-b border-gray-100">
              <p className="text-xs font-bold text-brand-900 truncate">{address}</p>
              <p className="text-xs text-gray-400 mt-0.5">{network}</p>
            </div>
            <button
              onClick={() => { disconnect(); setOpen(false); }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Disconnect
            </button>
          </div>
        </>
      )}
    </div>
  );
}
