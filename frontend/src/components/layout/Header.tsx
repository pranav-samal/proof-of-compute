import React from 'react';
import { Menu, Bell, ExternalLink } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { WalletButton } from '../ui/WalletButton';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Home',
  '/marketplace': 'Compute Marketplace',
  '/submit-job': 'Submit a Job',
  '/dashboard': 'Requester Dashboard',
  '/jobs': 'Job Details',
  '/provider': 'Provider Console',
  '/verifier': 'Verifier Console',
  '/receipt': 'Job Receipt',
  '/simulation': 'Simulation',
  '/verification': 'Verification Center',
};

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const location = useLocation();

  const title =
    Object.entries(PAGE_TITLES)
      .sort((a, b) => b[0].length - a[0].length)
      .find(
        ([path]) =>
          location.pathname === path ||
          (path !== '/' && location.pathname.startsWith(path)),
      )?.[1] ?? 'Proof-of-Compute';

  return (
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-200/70 h-14 flex items-center px-4 gap-3">
      {/* Mobile menu toggle */}
      <button
        onClick={onMenuClick}
        className="lg:hidden w-8 h-8 flex items-center justify-center rounded-2xl text-gray-500 hover:text-brand-900 hover:bg-gray-100/70 transition-colors"
        aria-label="Open navigation"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Page title */}
      <div className="flex-1 min-w-0">
        <h2 className="text-sm font-semibold text-brand-900 truncate">{title}</h2>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        <Link
          to="/submit-job"
          className={cn(
            'hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-pill',
            'text-xs font-medium bg-accent-500 text-white hover:bg-accent-600 transition-colors shadow-accent',
          )}
        >
          <ExternalLink className="w-3 h-3" />
          Submit Job
        </Link>

        <button className="relative w-8 h-8 flex items-center justify-center rounded-2xl text-gray-500 hover:text-brand-900 hover:bg-gray-100/70 transition-colors">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-accent-500" />
          <span className="sr-only">Notifications</span>
        </button>

        {/* Wallet */}
        <WalletButton />
      </div>
    </header>
  );
}
