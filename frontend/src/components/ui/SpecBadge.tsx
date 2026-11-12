import React from 'react';
import { cn } from '../../lib/utils';

/** Small pill for GPU/hardware spec values (e.g. "80 GB VRAM", "PyTorch") */
interface SpecBadgeProps {
  children: React.ReactNode;
  className?: string;
}

export function SpecBadge({ children, className }: SpecBadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center px-2.5 py-0.5 rounded-pill text-xs font-medium',
      'bg-gray-100/80 text-brand-700 border border-gray-200/70',
      className,
    )}>
      {children}
    </span>
  );
}
