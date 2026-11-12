import React from 'react';
import { STATUS_COLORS, STATUS_LABELS } from '../../data/constants';
import { cn } from '../../lib/utils';

interface StatusBadgeProps {
  status: string;
  className?: string;
  showDot?: boolean;
}

const DOT_COLORS: Record<string, string> = {
  available: 'bg-emerald-500',
  busy: 'bg-amber-500',
  offline: 'bg-gray-400',
  draft: 'bg-gray-400',
  queued: 'bg-indigo-500',
  running: 'bg-indigo-500',
  completed: 'bg-emerald-500',
  failed: 'bg-red-500',
  cancelled: 'bg-gray-400',
};

export function StatusBadge({ status, className, showDot = false }: StatusBadgeProps) {
  const colorClass = STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-500 ring-1 ring-gray-200';
  const label = STATUS_LABELS[status] ?? status;
  const dotColor = DOT_COLORS[status] ?? 'bg-gray-400';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-pill text-xs font-semibold tracking-wide',
        colorClass,
        className,
      )}
    >
      {showDot && (
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full flex-shrink-0',
            dotColor,
            status === 'running' || status === 'queued' ? 'animate-pulse' : '',
          )}
        />
      )}
      {label}
    </span>
  );
}
