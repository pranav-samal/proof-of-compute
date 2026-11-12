import React from 'react';
import { cn } from '../../lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
}

const paddingClasses = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
};

export function Card({ children, className, padding = 'md', hover = false }: CardProps) {
  return (
    <div
      className={cn(
        'bg-white border border-gray-200/80 rounded-2xl shadow-card',
        paddingClasses[padding],
        hover && 'hover:shadow-card-md hover:border-gray-300/80 transition-all duration-300 cursor-pointer',
        className,
      )}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}

export function CardHeader({ title, subtitle, action, className }: CardHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4 mb-4', className)}>
      <div>
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

interface CardSectionProps {
  children: React.ReactNode;
  className?: string;
  label?: string;
}

export function CardSection({ children, className, label }: CardSectionProps) {
  return (
    <div className={cn('border-t border-gray-100 pt-4 mt-4', className)}>
      {label && <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{label}</p>}
      {children}
    </div>
  );
}
