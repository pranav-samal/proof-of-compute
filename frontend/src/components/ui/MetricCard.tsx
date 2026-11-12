import React from 'react';
import { cn } from '../../lib/utils';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: {
    value: string;
    direction: 'up' | 'down' | 'neutral';
    label?: string;
  };
  accent?: 'blue' | 'green' | 'amber' | 'purple' | 'teal';
  className?: string;
}

const accentMap = {
  blue: { icon: 'bg-blue-50 text-blue-600', value: 'text-blue-700' },
  green: { icon: 'bg-emerald-50 text-emerald-600', value: 'text-emerald-700' },
  amber: { icon: 'bg-amber-50 text-amber-600', value: 'text-amber-700' },
  purple: { icon: 'bg-purple-50 text-purple-600', value: 'text-purple-700' },
  teal: { icon: 'bg-teal-50 text-teal-600', value: 'text-teal-700' },
};

export function MetricCard({
  title, value, subtitle, icon, trend, accent, className,
}: MetricCardProps) {
  const colors = accent ? accentMap[accent] : null;

  return (
    <div className={cn('bg-white border border-gray-200/80 rounded-2xl shadow-card p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-500 truncate">{title}</p>
          <p className={cn(
            'mt-1.5 text-2xl font-bold tracking-tight',
            colors ? colors.value : 'text-brand-900',
          )}>
            {value}
          </p>
          {subtitle && (
            <p className="mt-1 text-xs text-gray-400">{subtitle}</p>
          )}
          {trend && (
            <div className={cn(
              'mt-2 inline-flex items-center gap-1 text-xs font-medium',
              trend.direction === 'up' ? 'text-emerald-600' :
                trend.direction === 'down' ? 'text-red-500' :
                  'text-gray-400',
            )}>
              <span>
                {trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '→'}
              </span>
              <span>{trend.value}</span>
              {trend.label && <span className="text-gray-400 font-normal">{trend.label}</span>}
            </div>
          )}
        </div>
        {icon && (
          <div className={cn(
            'flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center',
            colors ? colors.icon : 'bg-gray-100 text-gray-500',
          )}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
