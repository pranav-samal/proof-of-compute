import React from 'react';
import { cn } from '../../lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'teal' | 'gray' | 'indigo' | 'orange';
  size?: 'sm' | 'md';
  className?: string;
}

// Sarvam-style: pill-shaped, indigo as the "brand" badge, orange as accent
const variantClasses: Record<string, string> = {
  default: 'bg-gray-100 text-gray-600',
  indigo: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',   // Sarvam primary badge
  orange: 'bg-accent-50 text-accent-700 ring-1 ring-accent-200',   // Sarvam CTA badge
  blue: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',   // alias → indigo
  green: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  purple: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200',
  teal: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200',
  gray: 'bg-gray-100 text-gray-500 ring-1 ring-gray-200',
};

export function Badge({ children, variant = 'default', size = 'sm', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-semibold rounded-pill tracking-wide',
        size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
