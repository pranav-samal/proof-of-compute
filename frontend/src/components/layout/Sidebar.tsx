import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Home, LayoutGrid, Send, BarChart3, ClipboardList,
  Server, ShieldCheck, Cpu, X, ChevronRight,
  Receipt, BarChart2, Layers,
} from 'lucide-react';
import { cn } from '../../lib/utils';

const NAV_SECTIONS = [
  {
    label: 'Main',
    items: [
      { path: '/', label: 'Home', icon: Home },
      { path: '/marketplace', label: 'Marketplace', icon: LayoutGrid },
      { path: '/submit-job', label: 'Submit Job', icon: Send },
      { path: '/dashboard', label: 'My Dashboard', icon: BarChart3 },
      { path: '/jobs', label: 'Job Details', icon: ClipboardList },
    ],
  },
  {
    label: 'Provider & Verifier',
    items: [
      { path: '/provider', label: 'Provider Console', icon: Server },
      { path: '/verifier', label: 'Verifier Console', icon: Layers },
    ],
  },
  {
    label: 'Tools',
    items: [
      { path: '/receipt', label: 'Job Receipt', icon: Receipt },
      { path: '/simulation', label: 'Simulation', icon: BarChart2 },
      { path: '/verification', label: 'Verification', icon: ShieldCheck },
    ],
  },
];

interface SidebarProps { open: boolean; onClose: () => void; }

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const location = useLocation();

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-brand-900 flex items-center justify-center flex-shrink-0">
            <Cpu className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-brand-900 leading-tight">Proof-of-Compute</p>
            <p className="text-[10px] text-gray-400 leading-tight">Decentralized GPU Marketplace</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="lg:hidden w-7 h-7 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <p className="px-3 mb-1 text-[10px] font-black text-gray-400 uppercase tracking-widest">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map(({ path, label, icon: Icon }) => {
                const isActive = path === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(path);
                return (
                  <NavLink
                    key={path}
                    to={path}
                    onClick={onClose}
                    className={cn('sidebar-link', isActive && 'active')}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1">{label}</span>
                    {isActive && <ChevronRight className="w-3 h-3 opacity-40" />}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-gray-100">
        <div className="flex items-center gap-2 p-2 rounded-xl bg-amber-50 border border-amber-200">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
          <p className="text-xs text-amber-700 font-bold">Prototype / Demo</p>
        </div>
        <p className="mt-2 text-[10px] text-gray-400 leading-relaxed">
          No real compute, blockchain, or payments.
        </p>
      </div>
    </div>
  );
}

export function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden" onClick={onClose} aria-hidden="true" />
      )}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 shadow-card-lg transition-transform duration-300 ease-in-out lg:hidden',
        open ? 'translate-x-0' : '-translate-x-full',
      )}>
        <SidebarContent onClose={onClose} />
      </aside>
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 lg:left-0 bg-white border-r border-gray-200">
        <SidebarContent />
      </aside>
    </>
  );
}
