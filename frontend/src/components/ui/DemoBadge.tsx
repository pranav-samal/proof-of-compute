import React from 'react';
import { FlaskConical } from 'lucide-react';
import { cn } from '../../lib/utils';

interface DemoBadgeProps {
  className?: string;
  label?: string;
}

/** Visible marker that a value is mock/illustrative data, not a real on-chain record. */
export function DemoBadge({ className, label = 'Demo data' }: DemoBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-pill',
        'bg-amber-50 text-amber-700 ring-1 ring-amber-200 text-xs font-semibold',
        className,
      )}
    >
      <FlaskConical className="w-3 h-3" />
      {label}
    </span>
  );
}
