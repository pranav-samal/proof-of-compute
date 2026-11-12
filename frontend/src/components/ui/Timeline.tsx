import React from 'react';
import { CheckCircle2, Circle, Clock, AlertCircle, Loader2 } from 'lucide-react';
import type { JobTimelineEvent } from '../../types';
import { formatDateTime } from '../../lib/utils';
import { cn } from '../../lib/utils';

interface TimelineProps {
  events: JobTimelineEvent[];
  className?: string;
}

const iconMap = {
  completed: <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
  active:    <Loader2 className="w-4 h-4 text-accent-600 animate-spin" />,
  pending:   <Circle className="w-4 h-4 text-gray-300" />,
  error:     <AlertCircle className="w-4 h-4 text-red-500" />,
};

const lineColorMap = {
  completed: 'bg-emerald-200',
  active:    'bg-brand-200',
  pending:   'bg-gray-100',
  error:     'bg-red-200',
};

export function Timeline({ events, className }: TimelineProps) {
  return (
    <ol className={cn('relative', className)}>
      {events.map((event, i) => {
        const isLast = i === events.length - 1;
        return (
          <li key={event.id} className="flex gap-3">
            {/* Icon + connector line */}
            <div className="flex flex-col items-center">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center shadow-sm">
                {iconMap[event.status]}
              </div>
              {!isLast && (
                <div className={cn('w-0.5 flex-1 my-1', lineColorMap[event.status])} />
              )}
            </div>

            {/* Content */}
            <div className={cn('pb-6', isLast && 'pb-0')}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn(
                  'text-sm font-medium',
                  event.status === 'pending' ? 'text-gray-400' : 'text-gray-800',
                )}>
                  {event.label}
                </span>
                {event.timestamp && (
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDateTime(event.timestamp)}
                  </span>
                )}
              </div>
              {event.detail && (
                <p className="mt-0.5 text-xs text-gray-500">{event.detail}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

