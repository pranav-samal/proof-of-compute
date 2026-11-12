import React from 'react';
import { cn } from '../../lib/utils';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  note?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function EmptyState({
  icon, title, description, action, note, className, size = 'md',
}: EmptyStateProps) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center text-center',
      size === 'sm' ? 'py-8 px-4' : size === 'md' ? 'py-14 px-6' : 'py-20 px-8',
      className,
    )}>
      {icon && (
        <div className="w-12 h-12 rounded-2xl bg-gray-100/80 flex items-center justify-center text-gray-400 mb-4 border border-gray-200/60">
          {icon}
        </div>
      )}
      <p className={cn(
        'font-bold text-brand-900',
        size === 'sm' ? 'text-sm' : 'text-base',
      )}>
        {title}
      </p>
      {description && (
        <p className={cn(
          'mt-1.5 text-gray-500 max-w-sm',
          size === 'sm' ? 'text-xs' : 'text-sm',
        )}>
          {description}
        </p>
      )}
      {note && (
        <p className="mt-2 text-xs text-gray-400 italic">{note}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
